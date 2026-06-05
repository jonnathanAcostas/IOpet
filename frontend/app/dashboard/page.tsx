'use client';

import { Layout } from '@/components/Layout/Layout';
import { StatsCard } from '@/components/Dashboard/StatsCard';
import { FeedingChart } from '@/components/Dashboard/FeedingChart';
import { usePets } from '@/hooks/usePets';
import { useFeedingHistory } from '@/hooks/useFeedingHistory';
import { useMobile } from '@/hooks/useMobile';
import { useTranslation } from '@/hooks/useTranslation';
import { useFeederStatus } from '@/hooks/useFeederStatus';

function ChevronDown() {
  return (
    <svg viewBox="0 0 24 24">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg viewBox="0 0 24 24">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

export default function DashboardPage() {
  const { data: pets } = usePets();
  const { data: schedules } = useFeedingHistory();
  const { online: feederOnline, ip: feederIp, loading: feederLoading } = useFeederStatus();
  const isMobile = useMobile();
  const { t } = useTranslation();

  const m = (cls: string) => (isMobile ? `${cls} ${cls}__mobile` : cls);

  const totalPets = pets?.length ?? 0;
  const todayFeedings = schedules?.length ?? 0;
  const pending = schedules?.filter((s) => s.status === 'pending').length ?? 0;
  const completed = schedules?.filter((s) => s.status === 'completed').length ?? 0;

  return (
    <Layout>
      <div className={m('dashboard')}>
        {/* Header */}
        <div className="dashboard-header">
          <div className="dashboard-header-left">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <h1>{t('dashboard.title')}</h1>
              <div className={`feeder-status-badge ${feederLoading ? 'loading' : feederOnline ? 'online' : 'offline'}`}>
                <span className="feeder-status-dot" />
                <span>
                  {feederLoading
                    ? 'Verificando comedero...'
                    : feederOnline
                    ? `Comedero En Línea (${feederIp})`
                    : 'Comedero Desconectado'}
                </span>
              </div>
            </div>
            <p>{t('dashboard.welcome')}</p>
          </div>
          {/* 
          <div className="dashboard-period">
            <span>This Month</span>
            <ChevronDown />
          </div>
          */}
        </div>

        {/* Stats Grid */}
        <div className={m('stats-grid')}>
          <StatsCard
            label={t('dashboard.totalPets')}
            value={totalPets}
            icon="🐕"/* 
            trend={{ value: '+12%', positive: true }} */
          />
          <StatsCard
            label={t('dashboard.feedingsToday')}
            value={todayFeedings}
            icon="🍽️"
            /* trend={{ value: '+8%', positive: true }} */
          />
          <StatsCard
            label={t('dashboard.pending')}
            value={pending}
            icon="⏳"
            /* trend={{ value: '-3%', positive: false }} */
          />
          <StatsCard
            label={t('dashboard.completed')}
            value={completed}
            icon="✅"
            /* trend={{ value: '+18%', positive: true }} */
          />
        </div>

        {/* Charts */}
        <div className={m('charts-grid')}>
          <div className="chart-card">
            <div className="chart-card-header">
              <h3>{t('dashboard.pieChart.title')}</h3>
              <span>{t('dashboard.pieChart.subtitle')}</span>
            </div>
            <div className="donut-chart">
              <div className="donut">
                <div className="donut-inner">
                  <span>{totalPets}</span>
                  <span>Total</span>
                </div>
              </div>
              <div className="donut-legend">
                <div className="donut-legend-item">
                  <span className="donut-legend-dot" style={{ background: 'var(--color-primary)' }} />
                  {t('dashboard.pieChart.labels.dogs')}
                </div>
                <div className="donut-legend-item">
                  <span className="donut-legend-dot" style={{ background: 'var(--color-success)' }} />
                  {t('dashboard.pieChart.labels.cats')}
                </div>
                <div className="donut-legend-item">
                  <span className="donut-legend-dot" style={{ background: 'var(--color-info)' }} />
                  {t('dashboard.pieChart.labels.birds')}
                </div>
                <div className="donut-legend-item">
                  <span className="donut-legend-dot" style={{ background: 'var(--color-warning)' }} />
                  {t('dashboard.pieChart.labels.others')}
                </div>
              </div>
            </div>
          </div>

          {/* <FeedingChart schedules={schedules ?? []} /> */}
        </div>
        {/* Bottom Grid */}
        {/* <div className={m('bottom-grid')}>
          <div className="section-card">
            <div className="section-card-header">
              <h3>Recent Activity</h3>
              <a href="#">
                View all <ArrowRight />
              </a>
            </div>
            <div className="activity-list">
              <div className="activity-item">
                <span className="activity-dot activity-dot--success" />
                <div className="activity-content">
                  <div className="activity-text">Bella was fed</div>
                  <div className="activity-time">12 min ago</div>
                </div>
                <ArrowRight />
              </div>
              <div className="activity-item">
                <span className="activity-dot activity-dot--info" />
                <div className="activity-content">
                  <div className="activity-text">New pet Max registered</div>
                  <div className="activity-time">1 hour ago</div>
                </div>
                <ArrowRight />
              </div>
              <div className="activity-item">
                <span className="activity-dot activity-dot--warning" />
                <div className="activity-content">
                  <div className="activity-text">Feeding pending for Luna</div>
                  <div className="activity-time">2 hours ago</div>
                </div>
                <ArrowRight />
              </div>
              <div className="activity-item">
                <span className="activity-dot activity-dot--danger" />
                <div className="activity-content">
                  <div className="activity-text">Low stock alert: Dog Food</div>
                  <div className="activity-time">3 hours ago</div>
                </div>
                <ArrowRight />
              </div>
            </div>
          </div>

          <div className="section-card">
            <div className="section-card-header">
              <h3>Inventory Overview</h3>
              <a href="#">
                Manage <ArrowRight />
              </a>
            </div>
            <div className="product-mini-grid">
              <div className="product-mini-card">
                <div className="product-mini-img">🍖</div>
                <div className="product-mini-info">
                  <div className="product-mini-name">Dog Food</div>
                  <div className="product-mini-meta">$24.99 · 45 units</div>
                </div>
                <span className="product-mini-stock product-mini-stock--ok">OK</span>
              </div>
              <div className="product-mini-card">
                <div className="product-mini-img">🐟</div>
                <div className="product-mini-info">
                  <div className="product-mini-name">Cat Food</div>
                  <div className="product-mini-meta">$19.99 · 32 units</div>
                </div>
                <span className="product-mini-stock product-mini-stock--ok">OK</span>
              </div>
              <div className="product-mini-card">
                <div className="product-mini-img">🦜</div>
                <div className="product-mini-info">
                  <div className="product-mini-name">Bird Seed</div>
                  <div className="product-mini-meta">$9.99 · 8 units</div>
                </div>
                <span className="product-mini-stock product-mini-stock--low">Low</span>
              </div>
              <div className="product-mini-card">
                <div className="product-mini-img">🛁</div>
                <div className="product-mini-info">
                  <div className="product-mini-name">Shampoo</div>
                  <div className="product-mini-meta">$12.99 · 28 units</div>
                </div>
                <span className="product-mini-stock product-mini-stock--ok">OK</span>
              </div>
            </div>
          </div>
        </div> */}
      </div>
    </Layout>
  );
}
