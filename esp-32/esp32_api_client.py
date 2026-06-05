# =========================
# SMART PET FEEDER
# ESP32 + API CLIENT
# Consume el backend en lugar de Firebase directo
# =========================

import network
import socket
import time
import ntptime
import urequests
import ujson

from machine import Pin, RTC, PWM

# =========================
# CONFIGURACION BACKEND
# =========================
# CAMBIA ESTA IP por la IP del servidor donde corre el backend Express
BACKEND_IP = "192.168.1.10"
BACKEND_PORT = 4000
BACKEND_URL = "http://{}:{}/api/v1/feeder".format(BACKEND_IP, BACKEND_PORT)
POLL_INTERVAL = 30  # segundos entre consultas de horarios

# =========================
# REGISTRO DE IP EN BACKEND
# =========================
def registrar_ip_en_backend(esp32_ip):
    print("Registrando IP local en el backend...")
    try:
        url = BACKEND_URL + "/register"
        payload = {"ip": esp32_ip}
        print("  Enviando POST a:", url, "con payload:", payload)
        
        # Serializar manualmente para maxima compatibilidad en MicroPython
        import ujson
        data_str = ujson.dumps(payload)
        headers = {"Content-Type": "application/json"}
        
        response = urequests.post(url, data=data_str, headers=headers)
        print("  Respuesta HTTP registro:", response.status_code)
        if response.status_code == 200:
            print("  IP del ESP32 registrada exitosamente en el backend")
        response.close()
    except Exception as e:
        print("  ERROR al registrar la IP en el backend:", e)

# =========================
# WIFI
# =========================
ssid = "CELERITY_SMOKE"
password = "1725Smoke@"

print("Conectando a WiFi:", ssid)

wlan = network.WLAN(network.STA_IF)
wlan.active(True)
try:
    wlan.disconnect()
except:
    pass
time.sleep(0.5)
wlan.connect(ssid, password)

timeout = 20
while not wlan.isconnected() and timeout > 0:
    time.sleep(1)
    timeout -= 1

if not wlan.isconnected():
    print("ERROR: No se pudo conectar al WiFi")
    raise SystemExit(1)

print("WiFi conectado")
ESP32_IP = wlan.ifconfig()[0]
print("IP del ESP32:", ESP32_IP)
print("BACKEND_URL configurado:", BACKEND_URL)

# Registrar la IP en el backend
registrar_ip_en_backend(ESP32_IP)

# =========================
# RTC + INTERNET TIME
# =========================
rtc = RTC()

print("Sincronizando hora...")

try:
    ntptime.settime()
    print("Hora sincronizada correctamente")
except:
    print("No se pudo sincronizar la hora")

# =========================
# PINES
# =========================
pulsador = Pin(4, Pin.IN, Pin.PULL_DOWN)
servo_pin = Pin(15, Pin.OUT)
dispensador = PWM(servo_pin, freq=50)

# =========================
# MOVER SERVO
# =========================
def mover_servo(angulo):
    # Traducir el angulo (0 a 180) al ancho de pulso en nanosegundos (duty_ns)
    # 500 us (minimo, 500,000 ns) a 2400 us (maximo, 2,400,000 ns)
    min_pulse_ns = 500000
    max_pulse_ns = 2400000
    pulse_ns = int(min_pulse_ns + (angulo / 180.0) * (max_pulse_ns - min_pulse_ns))
    dispensador.duty_ns(pulse_ns)

# Inicializar en 0 grados
mover_servo(0)

# =========================
# VARIABLES
# =========================
estado = "ESPERANDO"
ultimos_horarios_procesados = []  # Evita repetir la misma comida
ultimo_poll = 0

# =========================
# TEST DE CONEXION AL BACKEND
# =========================
def probar_conexion_backend():
    print("Probando conexion con el backend...")
    try:
        url = "http://{}:{}/health".format(BACKEND_IP, BACKEND_PORT)
        print("  Intentando GET:", url)
        response = urequests.get(url)
        print("  Respuesta HTTP:", response.status_code)
        if response.status_code == 200:
            print("  Backend respondio OK")
            response.close()
            return True
        response.close()
        return False
    except Exception as e:
        print("  ERROR al conectar con el backend:", e)
        print("  Verifica que:")
        print("    - El backend Express este corriendo en {}:{}".format(BACKEND_IP, BACKEND_PORT))
        print("    - No haya firewall bloqueando el puerto {}".format(BACKEND_PORT))
        print("    - La IP {} sea correcta".format(BACKEND_IP))
        return False

# =========================
# OBTENER HORA ECUADOR
# =========================
def obtener_hora():
    fecha = rtc.datetime()
    hora = fecha[4]
    minuto = fecha[5]

    # ECUADOR UTC -5
    hora = hora - 5
    if hora < 0:
        hora += 24

    hora = "0" + str(hora) if hora < 10 else str(hora)
    minuto = "0" + str(minuto) if minuto < 10 else str(minuto)

    return hora + ":" + minuto

# =========================
# ACTIVAR DISPENSADOR
# =========================
def activar_dispensador(origen="MANUAL"):
    global estado
    estado = "SIRVIENDO COMIDA"
    print("ACTIVADO DESDE:", origen)

    mover_servo(90)
    time.sleep(5)
    mover_servo(0)

    estado = "COMIDA SERVIDA"
    print("COMIDA SERVIDA")

# =========================
# LLAMAR API: OBTENER HORARIOS
# =========================
def obtener_horarios_api():
    try:
        url = BACKEND_URL + "/schedules"
        response = urequests.get(url)
        if response.status_code == 200:
            datos = response.json()
            response.close()
            if datos and "data" in datos and datos["data"]:
                return datos["data"]
        else:
            print("  API respondio con codigo:", response.status_code)
            response.close()
    except Exception as e:
        print("  Error al consultar {}: {}".format(url, e))
    return []

# =========================
# LLAMAR API: COMPLETAR HORARIO
# =========================
def completar_horario_api(schedule_id):
    try:
        url = BACKEND_URL + "/complete-schedule"
        payload = {"scheduleId": schedule_id}
        response = urequests.post(url, json=payload)
        if response.status_code == 200:
            print("  HORARIO COMPLETADO:", schedule_id)
        else:
            print("  Error al completar, codigo:", response.status_code, url)
        response.close()
    except Exception as e:
        print("  Error al completar {}: {}".format(url, e))

# =========================
# VERIFICAR HORARIOS DESDE API
# =========================
def verificar_horarios_api():
    global ultimos_horarios_procesados
    
    # 1. Obtener fecha/hora actual en UTC
    fecha_utc = rtc.datetime()
    year, month, day, _, hour_utc, minute_utc, _, _ = fecha_utc
    current_utc_iso = "{:04d}-{:02d}-{:02d}T{:02d}:{:02d}".format(year, month, day, hour_utc, minute_utc)
    
    # 2. Obtener hora actual local (Ecuador)
    hora_local_ecuador = obtener_hora()
    
    horarios = obtener_horarios_api()

    for horario in horarios:
        scheduled_time = horario.get("scheduledTime", "")
        schedule_id = horario.get("id", "")

        se_debe_activar = False
        
        if "T" in scheduled_time:
            # Formato ISO (e.g. 2026-06-05T13:30:00.000Z)
            # Comparamos los primeros 16 caracteres (Año-Mes-DiaTHora:Minuto) en UTC
            if scheduled_time[:16] == current_utc_iso:
                se_debe_activar = True
        else:
            # Formato simple HH:MM (e.g. 08:30)
            if scheduled_time == hora_local_ecuador:
                se_debe_activar = True

        if se_debe_activar:
            if schedule_id not in ultimos_horarios_procesados:
                ultimos_horarios_procesados.append(schedule_id)
                print("¡HORARIO PROGRAMADO COINCIDE!", scheduled_time)
                activar_dispensador("API HORARIO " + scheduled_time)
                completar_horario_api(schedule_id)

                if len(ultimos_horarios_procesados) > 50:
                    ultimos_horarios_procesados = ultimos_horarios_procesados[-25:]

# =========================
# SERVIDOR WEB MINIMO
# =========================
tcp_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
tcp_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
tcp_socket.bind(('', 80))
tcp_socket.listen(5)
tcp_socket.settimeout(0.1)

print("Servidor web iniciado")
print("http://" + ESP32_IP)

# =========================
# TEST INICIAL DE CONEXION
# =========================
time.sleep(2)
registrar_ip_en_backend(ESP32_IP)
time.sleep(1)
conexion_ok = probar_conexion_backend()
if not conexion_ok:
    print("ADVERTENCIA: El backend no responde, los horarios automaticos no funcionaran")
print("Iniciando loop principal...")

# =========================
# LOOP PRINCIPAL
# =========================
while True:
    # =========================
    # BOTON FISICO
    # =========================
    if pulsador.value() == 1:
        time.sleep(0.03)
        if pulsador.value() == 1:
            print("BOTON FISICO")
            activar_dispensador("BOTON")
            time.sleep(0.3)

    # =========================
    # POLL API CADA N SEGUNDOS
    # =========================
    if time.time() - ultimo_poll >= POLL_INTERVAL:
        ultimo_poll = time.time()
        verificar_horarios_api()

    # =========================
    # WEB SERVER (SOLO STATUS Y LLENAR)
    # =========================
    try:
        conn, addr = tcp_socket.accept()
        request = conn.recv(1024)
        request = str(request)

        # =========================
        # STATUS (JSON)
        # =========================
        if "GET /status" in request:
            status_obj = {
                "status": estado,
                "currentTime": obtener_hora(),
                "lastFeeding": "--",
                "wifi": wlan.isconnected(),
                "ip": ESP32_IP
            }
            status_json = ujson.dumps(status_obj)
            conn.send("HTTP/1.1 200 OK\r\n")
            conn.send("Content-Type: application/json\r\n")
            conn.send("Access-Control-Allow-Origin: *\r\n")
            conn.send("Connection: close\r\n\r\n")
            conn.sendall(status_json)
            conn.close()
            continue

        # =========================
        # LLENAR (TRIGGER MANUAL)
        # =========================
        if "GET /llenar" in request:
            activar_dispensador("API")
            conn.send("HTTP/1.1 200 OK\r\n")
            conn.send("Content-Type: application/json\r\n")
            conn.send("Connection: close\r\n\r\n")
            conn.sendall('{"result":"ok"}')
            conn.close()
            continue

        # =========================
        # 404 PARA TODO LO DEMAS
        # =========================
        conn.send("HTTP/1.1 404 Not Found\r\n")
        conn.send("Connection: close\r\n\r\n")
        conn.close()

    except Exception as e:
        pass

    time.sleep(0.05)


