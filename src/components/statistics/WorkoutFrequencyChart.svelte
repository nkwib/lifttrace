<script>
  /**
   * Workouts-per-week chart. Shared by Statistics' Overview + Frequency views.
   * Mirrors WeeklyVolumeChart.svelte — same multi-week / solo / empty behaviour.
   */
  import { _ } from 'svelte-i18n';
  import { fmtWeekLabel, showBarLabel } from '../../lib/statsFormat.js';

  export let frequency = [];   // [{ week, count }]
  export let detailed = false;
  export let avg = 0;
  /** Weekly workout goal (from settings). When > 0 AND ≤ max bar, we
   *  render a dashed horizontal line across the chart at that y-position
   *  so the user can see which weeks hit target at a glance. */
  export let goal = 0;
  /** Excused days per week ({ [weekMonday]: n }, issue #121): each comes
   *  off that week's target, as on the weekly goal ring. */
  export let excusedWeeks = {};
  const target = (week) => Math.max(0, goal - (excusedWeeks[week] || 0));
  const hit = (f) => goal > 0 && target(f.week) > 0 && f.count >= target(f.week);

  $: dense = frequency.length > 12;
  // Tap-to-read: index of the selected bar, cleared when the data changes.
  let selected = -1;
  $: frequency, (selected = -1);
  const toggle = (i) => { selected = selected === i ? -1 : i; };
  $: barText = (f) => $_(hit(f) ? 'workout_frequency_chart.readout_hit' : 'workout_frequency_chart.readout', { values: { week: f.week, count: f.count } });

  $: max = frequency.length ? Math.max(...frequency.map(f => f.count)) : 0;
  // Height % from the bottom of the chart. Using the SAME max as the bars,
  // so an uncapped goal that exceeds max renders at the top edge.
  $: goalHeightPct = goal > 0 && max > 0 ? Math.min(100, (goal / max) * 100) : 0;
</script>

{#if frequency.length >= 2}
  <div class="chart-card">
    <h3 class="chart-title">{$_('workout_frequency_chart.title')}</h3>
    {#if detailed}
      <p class="chart-desc">{$_('workout_frequency_chart.desc')}</p>
    {/if}
    <div class="bar-chart" class:dense>
      {#if goalHeightPct > 0}
        <div class="goal-line" style="bottom: {goalHeightPct}%" title={$_('workout_frequency_chart.goal_title', { values: { goal } })}>
          <span class="goal-label">{$_('workout_frequency_chart.goal', { values: { goal } })}</span>
        </div>
      {/if}
      {#each frequency as f, i}
        <button type="button" class="bar-col" class:selected={selected === i}
          aria-pressed={selected === i}
          aria-label={barText(f)}
          title={barText(f)}
          on:click={() => toggle(i)}>
          <span class="bar freq" class:hit-goal={hit(f)} style="height: {max ? (f.count / max * 100) : 0}%"></span>
          <span class="bar-label" class:shown={showBarLabel(i, frequency.length)} aria-hidden="true">{fmtWeekLabel(f.week)}</span>
        </button>
      {/each}
    </div>
    <p class="readout" aria-live="polite">{#if selected >= 0 && frequency[selected]}{barText(frequency[selected])}{/if}</p>
    {#if detailed}
      <p class="chart-sub">{$_('workout_frequency_chart.average', { values: { avg } })}</p>
    {/if}
  </div>
{:else if frequency.length === 1}
  <div class="chart-card">
    <h3 class="chart-title">{$_('workout_frequency_chart.title')}</h3>
    {#if detailed}
      <p class="chart-desc">{$_('workout_frequency_chart.desc')}</p>
    {/if}
    <div class="solo-stat">
      <span class="solo-value">{frequency[0].count}</span>
      <span class="solo-label">{$_('workout_frequency_chart.this_week')}</span>
    </div>
    {#if detailed}
      <p class="chart-sub">{$_('workout_frequency_chart.log_another')}</p>
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
  .solo-value { font-size: 28px; font-weight: 800; color: var(--accent); line-height: 1; font-variant-numeric: tabular-nums; }
  .solo-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-3); font-weight: 600; }

  .bar-chart { position: relative; display: flex; align-items: flex-end; gap: 4px; height: 120px; padding: 0 2px; }
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
  .bar.freq { background: linear-gradient(180deg, var(--info), var(--accent-2)); }
  .bar.freq.hit-goal {
    background: linear-gradient(180deg, var(--success, #2FD66F), var(--accent-2));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--success, #2FD66F) 40%, transparent);
  }
  .bar-label { font-size: 9px; color: var(--text-3); white-space: nowrap; max-width: 100%; visibility: hidden; }
  .bar-label.shown { visibility: visible; }
  .dense .bar-label.shown { overflow: visible; max-width: 0; display: flex; justify-content: center; }
  .readout { font-size: 12px; color: var(--text-2, var(--text-3)); margin: 6px 0 0; min-height: 1.4em; text-align: center; font-variant-numeric: tabular-nums; }

  /* Horizontal goal reference line */
  .goal-line {
    position: absolute; left: 2px; right: 2px;
    height: 0;
    border-top: 1.5px dashed color-mix(in srgb, var(--success, #2FD66F) 70%, transparent);
    pointer-events: none;
    z-index: 1;
  }
  .goal-label {
    position: absolute; right: 0; top: -7px;
    background: var(--surface-1);
    color: var(--success, #2FD66F);
    font-size: 9px; font-weight: 700; letter-spacing: 0.05em;
    padding: 0 6px;
    border-radius: var(--radius-sm);
  }
</style>
