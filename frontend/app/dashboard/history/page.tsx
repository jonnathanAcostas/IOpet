'use client';

import { useState, useMemo } from 'react';
import { Layout } from '@/components/Layout/Layout';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { CreateDistributionModal } from '@/components/History/CreateDistributionModal';
import { useFeedingHistory } from '@/hooks/useFeedingHistory';
import { useCreateFeedingSchedule } from '@/hooks/useCreateFeedingSchedule';
import { usePets } from '@/hooks/usePets';
import { useMobile } from '@/hooks/useMobile';
import { useTranslation } from '@/hooks/useTranslation';
import type { FeedingSchedule, DistributionType } from '@/interfaces/feedingSchedule';
import { api } from '@/services/api';

function formatDate(iso: string, compact?: boolean): string {
  const d = new Date(iso);
  if (compact) {
    return d.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return d.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const statusIcon: Record<FeedingSchedule['status'], string> = {
  completed: '✅',
  pending: '⏳',
  missed: '❌',
};

const speciesEmoji: Record<string, string> = { dog:'🐶', cat:'🐱', bird:'🐦', fish:'🐟', other:'🐾' };

const statusTranslations: Record<FeedingSchedule['status'], string> = {
  completed: 'Completada',
  pending: 'Pendiente',
  missed: 'Perdida',
};

const typeTranslations: Record<DistributionType, string> = {
  manual: 'Manual',
  programmed: 'Programada',
};

function StatusBadge({ status }: { status: FeedingSchedule['status'] }) {
  return <span className={`status-badge ${status}`}>{statusTranslations[status] || status}</span>;
}

function TypeBadge({ type }: { type: DistributionType }) {
  return <span className={`type-badge ${type}`}>{typeTranslations[type] || type}</span>;
}

export default function HistoryPage() {
  const { data: schedules, loading, error, refetch } = useFeedingHistory();
  const { data: pets } = usePets();
  const { createSchedule } = useCreateFeedingSchedule();
  const isMobile = useMobile();
  const { t } = useTranslation();
  const m = (cls: string) => isMobile ? `${cls} ${cls}__mobile` : cls;

  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [servingId, setServingId] = useState<string | null>(null);

  const petMap = useMemo(() => {
    const map = new Map<string, string>();
    if (pets) {
      pets.forEach((pet) => {
        if (pet.id) map.set(pet.id, pet.name);
      });
    }
    return map;
  }, [pets]);

  const filteredSchedules = useMemo(() => {
    if (!schedules) return [];
    if (typeFilter === 'all') return schedules;
    return schedules.filter((s) => s.distributionType === typeFilter);
  }, [schedules, typeFilter]);

  const handleCreateDistribution = async (data: {
    petId: string;
    portionSize: string;
    foodType: string;
    scheduledTime: string;
    distributionType: 'manual' | 'programmed';
    notes?: string;
  }) => {
    const result = await createSchedule(data);
    if (result) {
      await refetch();
    }
  };

  const handleDispense = async (schedule: FeedingSchedule) => {
    if (!schedule.id) return;
    setServingId(schedule.id);
    try {
      const res = await api.post('/feeder/feed-now', {
        petId: schedule.petId,
        portionSize: schedule.portionSize,
        foodType: schedule.foodType,
      });
      if (res.success) {
        alert(`✅ Comida servida correctamente para ${schedule.petName || petMap.get(schedule.petId) || 'la mascota'}`);
        await refetch();
      } else {
        alert(`❌ Error al servir: ${res.message || 'Comedero no disponible'}`);
      }
    } catch (err) {
      alert(`❌ Error de conexión: ${err instanceof Error ? err.message : 'Error desconocido'}`);
    } finally {
      setServingId(null);
    }
  };

  return (
    <Layout>
      <div className={m('history-page')}>
        <div className="history-header">
          <div>
            <h1>{t('history.title')}</h1>
            <p className={m('subtitle')}>{t('history.subtitle')}</p>
          </div>
          <button className="btn btn--primary" onClick={() => setShowCreateModal(true)}>
            + {t('history.addDistribution')}
          </button>
        </div>

        {/* Filter bar */}
        <div className="history-filters">
          <label className="filter-label">
            <span>{t('history.filter.label')}</span>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="all">{t('history.filter.all')}</option>
              <option value="manual">{t('history.filter.manual')}</option>
              <option value="programmed">{t('history.filter.programmed')}</option>
            </select>
          </label>
        </div>

        <div className={m('history-table-wrapper')}>
          {loading ? (
            <LoadingSpinner />
          ) : error ? (
            <div className={m('empty-state')}>
              <span className={m('empty-icon')}>⚠️</span>
              <p className={m('empty-text')}>{error}</p>
              <button
                onClick={refetch}
                style={{
                  marginTop: 8,
                  padding: '8px 20px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-primary)',
                  background: 'transparent',
                  color: 'var(--color-primary)',
                  fontWeight: 600,
                }}
              >
                {t('common.retry')}
              </button>
            </div>
          ) : !filteredSchedules || filteredSchedules.length === 0 ? (
            <EmptyState icon="🍽️" message={typeFilter === 'all' ? t('history.noHistory') : t('history.noFiltered')} />
          ) : (
            <table className={m('history-table')}>
              <thead>
                <tr className={m('history-header-row')}>
                  <th className={m('history-th')} data-label="Pet">{t('history.table.pet')}</th>
                  <th className={m('history-th')} data-label="Food">{t('history.table.food')}</th>
                  <th className={m('history-th')} data-label="Portion">{t('history.table.portion')}</th>
                  <th className={m('history-th')} data-label="Scheduled">{t('history.table.scheduled')}</th>
                  <th className={m('history-th')} data-label="Completed">{t('history.table.completed')}</th>
                  <th className={m('history-th')} data-label="Type">{t('history.table.type')}</th>
                  <th className={m('history-th')} data-label="Status">{t('history.table.status')}</th>
                  <th className={m('history-th')} data-label="Action">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filteredSchedules.map((schedule) => (
                  <tr key={schedule.id}>
                    <td className={m('history-td')} data-label="🐾">
                      {speciesEmoji[schedule.petSpecies || 'other'] || '🐾'}
                      {' '}
                      {schedule.petName || petMap.get(schedule.petId) || 'Desconocida'}
                    </td>
                    <td className={m('history-td')} data-label="🍖">{schedule.foodType}</td>
                    <td className={m('history-td')} data-label="⚖️">{schedule.portionSize}</td>
                    <td className={m('history-td')} data-label="🕐">{formatDate(schedule.scheduledTime, isMobile)}</td>
                    <td className={m('history-td')} data-label="✅">
                      {schedule.completedTime
                        ? formatDate(schedule.completedTime, isMobile)
                        : '—'}
                    </td>
                    <td className={m('history-td')} data-label="📋">
                      {isMobile ? (
                        <span className={`type-icon ${schedule.distributionType}`}>
                          {schedule.distributionType === 'manual' ? '🖐️' : '⏰'}
                        </span>
                      ) : (
                        <TypeBadge type={schedule.distributionType} />
                      )}
                    </td>
                    <td className={m('history-td')} data-label="📌">
                      {isMobile ? (
                        <span className={`status-icon ${schedule.status}`}>{statusIcon[schedule.status]}</span>
                      ) : (
                        <StatusBadge status={schedule.status} />
                      )}
                    </td>
                    <td className={m('history-td')} data-label="⚙️">
                      {schedule.distributionType === 'manual' ? (
                        <button
                          className="btn btn--primary btn--sm"
                          disabled={servingId === schedule.id}
                          onClick={() => handleDispense(schedule)}
                          style={{
                            padding: '4px 10px',
                            fontSize: '0.75rem',
                            minHeight: 'auto',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            borderRadius: 'var(--radius-sm)'
                          }}
                        >
                          {servingId === schedule.id ? '⏳ Serviendo...' : '🍲 Servir'}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <CreateDistributionModal
        isOpen={showCreateModal}
        pets={pets || []}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateDistribution}
      />
    </Layout>
  );
}
