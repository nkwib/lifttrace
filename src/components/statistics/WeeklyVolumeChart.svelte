<script>
  /**
   * Weekly volume bar chart. Shared by Statistics' Overview + Volume views.
   * - Multi-week: renders the bar chart.
   * - Single-week: renders the solo-stat card.
   * - Zero weeks: renders nothing; parent decides the empty state.
   */
  import { _ } from 'svelte-i18n';
  import { fmtVol, fmtWeekLabel, showBarLabel } from '../../lib/statsFormat.js';

  export let volume = [];   // [{ week, volume }]
  export let unit = 'lbs';
  /** When true, show the 'Total · Peak' footer and the description line. */
  export let detailed = false;
  /** Total volume across weeks for the footer (caller computes it). */
  export let total = 0;

  $: max = volume.length ? Math.max(...volume.map(v => v.volume)) : 0;
  $: dense = volume.length > 12;
  // Tap-to-read: index of the selected bar, cleared when the data changes.
  let selected = -1;
  $: volume, (selected = -1);
  const toggle = (i) => { selected = selected === i ? -1 : i; };
</script>

{#if volume.length >= 2}
  <div class="chart-card">
    <h3 class="chart-title">{$_('weekly_volume_chart.title')}</h3>
    {#if detailed}
      <p class="chart-desc">{$_('weekly_volume_chart.desc')}</p>
    {/if}
    <div class="bar-chart" class:dense>
      {#each volume as v, i}
        <button type="button" class="bar-col" class:selected={selected === i}
          aria-pressed={selected === i}
          aria-label={`${v.week}: ${fmtVol(v.volume)} ${unit}`}
          title={`${v.week}: ${fmtVol(v.volume)} ${unit}`}
          on:click={() => toggle(i)}>
          <span class="bar" style="height: {max ? (v.volume / max * 100) : 0}%"></span>
          <span class="bar-label" class:shown={showBarLabel(i, volume.length)} aria-hidden="true">{fmtWeekLabel(v.week)}</span>
        </button>
      {/each}
    </div>
    <p class="readout" aria-live="polite">{#if selected >= 0 && volume[selected]}{$_('weekly_volume_chart.readout', { values: { week: volume[selected].week, value: fmtVol(volume[selected].volume), unit } })}{/if}</p>
    {#if detailed}
      <p class="chart-sub">{$_('weekly_volume_chart.total_peak', { values: { total: fmtVol(total), peak: fmtVol(max), unit } })}</p>
    {/if}
  </div>
{:else if volume.length === 1}
  <div class="chart-card">
    <h3 class="chart-title">{$_('weekly_volume_chart.title')}</h3>
    {#if detailed}
      <p class="chart-desc">{$_('weekly_volume_chart.desc')}</p>
    {/if}
    <div class="solo-stat">
      <span class="solo-value">{fmtVol(volume[0].volume)} {unit}</span>
      <span class="solo-label">{$_('weekly_volume_chart.this_week')}</span>
    </div>
    {#if detailed}
      <p class="chart-sub">{$_('weekly_volume_chart.log_another')}</p>
    {/if}
  </div>
{/if}

<style>
  .chart-card {
    background: var(--surface-1); border: 1px solid var(--border);
    border-radius: var(--radius-lg); padding: 16px;
  }
  .chart-title { font-size: 14px; font-weight: 700; color: var(--text-1); margin: 0 0 12px; display: flex; align-items: center; gap: 6px; }
  .chart-sub  { font-size: 12px; color: var(--text-3); margin: 10px 0 0; text-align: center; }
  .chart-desc { font-size: 12px; color: var(--text-3); margin: -8px 0 12px; line-height: 1.4; }

  .solo-stat {
    display: flex; flex-direction: column; align-items: center;
    padding: 24px 16px;
    background: linear-gradient(135deg, var(--accent-dim), transparent);
    border-radius: var(--radius-md); gap: 6px;
  }
  .solo-value { font-size: 28px; font-weight: 800; color: var(--accent-ink); line-height: 1; font-variant-numeric: tabular-nums; }
  .solo-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-3); font-weight: 600; }

  .bar-chart { display: flex; align-items: flex-end; gap: 4px; height: 120px; padding: 0 2px; }
  .bar-col {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; justify-content: flex-end; min-width: 0;
    background: none; border: 0; padding: 0; margin: 0; font: inherit; color: inherit; cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .bar-col:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; border-radius: 3px; }
  .bar-col.selected .bar { filter: brightness(1.35); }
  .dense { gap: 1px; }
  .dense .bar { border-radius: 1px 1px 0 0; }
  .bar {
    display: block; width: 100%; min-height: 4px;
    background: linear-gradient(180deg, var(--accent), var(--accent-2));
    border-radius: 3px 3px 0 0;
    transition: height var(--dur-slow);
  }
  .bar-label { font-size: 9px; color: var(--text-3); white-space: nowrap; max-width: 100%; visibility: hidden; }
  .bar-label.shown { visibility: visible; }
  .dense .bar-label.shown { overflow: visible; max-width: 0; display: flex; justify-content: center; }
  .readout { font-size: 12px; color: var(--text-2, var(--text-3)); margin: 6px 0 0; min-height: 1.4em; text-align: center; font-variant-numeric: tabular-nums; }
</style>
