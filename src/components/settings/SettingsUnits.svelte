<script>
  import { slide } from 'svelte/transition';
  import { weightUnit, dateFormat, timeFormat, weekStartsOn, language } from '../../stores/settings.js';
  import { _ } from 'svelte-i18n';
  import { AVAILABLE_LOCALES } from '../../i18n/index.js';

  export let expanded = false;
  export let visible = true;
  export let onToggle = () => {};
</script>

{#if visible}
  <button class="section-toggle" on:click={onToggle}>
    <span class="si"><span class="material-symbols-rounded">language</span></span>
    <span class="section-name">{$_('settings.units.section')}</span>
    <span class="material-symbols-rounded chevron" class:rotated={expanded}>expand_more</span>
  </button>
  {#if expanded}
    <div class="section-body" transition:slide={{ duration: 180 }}>
      <div class="card">
        <div class="setting-row">
          <span class="setting-label">{$_('settings.units.language')}</span>
          <select aria-label={$_('settings.units.language')} class="form-select-sm" bind:value={$language}>
            {#each AVAILABLE_LOCALES as l}<option value={l.code}>{l.label}</option>{/each}
          </select>
        </div>
        <div class="setting-divider"></div>
        <div class="setting-row">
          <span class="setting-label">{$_('settings_units.weight_unit')}</span>
          <select aria-label={$_('settings_units.weight_unit')} class="form-select-sm" bind:value={$weightUnit}>
            <option value="lbs">lbs</option>
            <option value="kg">kg</option>
          </select>
        </div>
        <div class="setting-divider"></div>
        <div class="setting-row">
          <span class="setting-label">{$_('settings_units.date_format')}</span>
          <select aria-label={$_('settings_units.date_format')} class="form-select-sm" bind:value={$dateFormat}>
            <option value="US">{$_('settings_units.date_us')}</option>
            <option value="EU">{$_('settings_units.date_eu')}</option>
            <option value="ISO">{$_('settings_units.date_iso')}</option>
          </select>
        </div>
        <div class="setting-row">
          <span class="setting-label">{$_('settings_units.week_starts_on')}</span>
          <select aria-label={$_('settings_units.week_starts_on')} class="form-select-sm" bind:value={$weekStartsOn}>
            <option value="monday">{$_('settings_units.week_monday')}</option>
            <option value="sunday">{$_('settings_units.week_sunday')}</option>
          </select>
        </div>
        <div class="setting-row">
          <span class="setting-label">{$_('settings_units.time_format')}</span>
          <select aria-label={$_('settings_units.time_format')} class="form-select-sm" bind:value={$timeFormat}>
            <option value="12h">{$_('settings_units.time_12h')}</option>
            <option value="24h">{$_('settings_units.time_24h')}</option>
          </select>
        </div>
      </div>
    </div>
  {/if}
{/if}
