<script>
  import { _ } from 'svelte-i18n';
  import { weightUnit } from '../../stores/settings.js';
  import { estimateOneRm, percentTable, MAX_REPS } from '../../lib/one-rm.js';

  export let compact = false;

  let weight = '';
  let reps = '';

  $: oneRm = estimateOneRm(weight, reps);
  $: table = percentTable(oneRm, $weightUnit);
  $: hasInput = weight !== '' && weight !== null && reps !== '' && reps !== null;
  $: idp = compact ? 'orm-c' : 'orm';
</script>

<div class="orm" class:compact>
  <div class="orm-inputs">
    <div class="orm-field">
      <label class="orm-label" for="{idp}-weight">{$_('gym_tools.lifted_weight')} <span class="unit">({$weightUnit})</span></label>
      <input id="{idp}-weight" class="orm-input" type="number" step="0.5" min="0" inputmode="decimal" bind:value={weight}
             placeholder={$weightUnit === 'kg' ? $_('gym_tools.weight_ph_kg') : $_('gym_tools.weight_ph_lb')} />
    </div>
    <div class="orm-field orm-field-reps">
      <label class="orm-label" for="{idp}-reps">{$_('gym_tools.reps')}</label>
      <input id="{idp}-reps" class="orm-input" type="number" step="1" min="1" max={MAX_REPS} inputmode="numeric" bind:value={reps}
             placeholder="5" />
    </div>
  </div>

  {#if oneRm}
    <div class="orm-result">
      <span class="orm-val">{oneRm}</span>
      <span class="orm-unit">{$weightUnit}</span>
      <span class="orm-cap">{$_('gym_tools.est_1rm')}</span>
    </div>
    <div class="orm-grid">
      {#each table as row}
        <div class="orm-row"><span class="orm-pct">{row.pct}%</span><span class="orm-w">{row.weight} {$weightUnit}</span></div>
      {/each}
    </div>
  {:else if hasInput}
    <div class="orm-hint">{$_('gym_tools.reps_hint', { values: { max: MAX_REPS } })}</div>
  {/if}
</div>

<style>
  .orm-inputs { display: flex; gap: 10px; margin-bottom: 12px; }
  .orm-field { flex: 2; min-width: 0; }
  .orm-field-reps { flex: 1; }
  .orm-label { font-size: 13px; font-weight: 600; color: var(--text-2); margin-bottom: 6px; display: block; }
  .orm-input {
    width: 100%; box-sizing: border-box; background: var(--surface-2); border: 1px solid var(--border);
    border-radius: var(--radius-md); padding: 10px 14px;
    color: var(--text-1); font-size: 16px; font-family: inherit; outline: none;
  }
  .orm-input:focus { border-color: var(--accent); }
  .orm-result { display: flex; align-items: baseline; gap: 8px; justify-content: center; flex-wrap: wrap; padding: 8px 0 14px; }
  .orm-val { font-size: 36px; font-weight: 800; color: var(--accent); }
  .orm-unit { font-size: 18px; color: var(--text-3); font-weight: 600; }
  .orm-cap { width: 100%; text-align: center; font-size: 12px; color: var(--text-3); }
  .orm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; }
  .orm-row { display: flex; justify-content: space-between; font-size: 14px; padding: 4px 0; border-bottom: 1px solid var(--border); }
  .orm-pct { color: var(--text-3); font-weight: 600; }
  .orm-w { color: var(--text-1); font-weight: 600; }
  .orm-hint { font-size: 13px; color: var(--text-3); text-align: center; padding: 20px 0; }

  .compact .orm-label { font-size: 11px; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.04em; }
  .compact .orm-input { padding: 6px 8px; font-size: 13px; }
  .compact .orm-val { font-size: 28px; }
  .compact .orm-unit { font-size: 15px; }
  .compact .orm-grid { gap: 2px 10px; }
  .compact .orm-row { font-size: 12px; padding: 2px 0; }
</style>
