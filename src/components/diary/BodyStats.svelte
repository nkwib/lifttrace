<script>
  import { closeOnBack } from '../../lib/back-stack.js';
  import { trapFocus } from '../../lib/focus-trap.js';
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { _ } from 'svelte-i18n';
  import { portal } from '../../lib/portal.js';
  import { bodyStatsVisible, weightUnit, dateFormat } from '../../stores/settings.js';
  import { confirmDialog } from '../../stores/confirmDialog.js';
  import { showSuccess, showError } from '../../stores/toast.js';
  import { currentDate } from '../../stores/workout.js';
  import { uploadAndAttachPhoto } from '../../lib/progress-photo-upload.js';
  import { onSyncChanges, newestRead } from '../../lib/sync-refresh.js';
  import { adoptLoggedWeight } from '../../lib/profile-weight.js';

  export let open = false;

  // Progress photo capture for the date this sheet is editing. The
  // timeline and comparison live on /progress; this is the shortcut for
  // someone already logging today's measurements.
  let photoInput;
  let photoUploading = false;

  async function onPhotoFile(e) {
    const file = e.target.files?.[0];
    if (photoInput) photoInput.value = '';
    if (!file) return;
    photoUploading = true;
    try {
      await uploadAndAttachPhoto(file, $currentDate);
      showSuccess($_('progress.toast.added'));
    } catch (err) {
      showError(err.message || $_('progress.toast.add_failed'));
    } finally {
      photoUploading = false;
    }
  }

  // Labels carry no unit: getUnit() appends it, e.g. "Weight (lbs)" or
  // "Body Fat (%)". body_stats_body_fat is distinct from
  // settings_workout.body_stats.body_fat ("Body Fat %") to avoid the
  // doubled "Body Fat % (%)" caption.
  const ALL_STATS = [
    { id: 'weight',  labelKey: 'settings_workout.body_stats.weight' },
    { id: 'bodyFat', labelKey: 'diary_extra.body_stats_body_fat' },
    { id: 'neck',    labelKey: 'settings_workout.body_stats.neck' },
    { id: 'chest',   labelKey: 'settings_workout.body_stats.chest' },
    { id: 'waist',   labelKey: 'settings_workout.body_stats.waist' },
    { id: 'hips',    labelKey: 'settings_workout.body_stats.hips' },
    { id: 'biceps',  labelKey: 'settings_workout.body_stats.biceps' },
    { id: 'thighs',  labelKey: 'settings_workout.body_stats.thighs' },
    { id: 'calves',  labelKey: 'settings_workout.body_stats.calves' },
  ];

  $: lengthUnit = $weightUnit === 'kg' ? 'cm' : 'in';
  $: visibleStats = ALL_STATS.filter(s => ($bodyStatsVisible || []).includes(s.id));

  // Format $currentDate (always YYYY-MM-DD) using the user's preferred
  // date format from Settings → Units. Same logic as
  // Diary.svelte#formatDateSub so the diary header and the body-stats
  // sheet show identical-looking dates.
  function _fmtDate(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    if ($dateFormat === 'EU')  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    if ($dateFormat === 'ISO') return dateStr;
    return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  }

  function getUnit(id) {
    if (id === 'weight') return $weightUnit || 'lbs';
    if (id === 'bodyFat') return '%';
    return lengthUnit;
  }

  let stats = {};
  let saving = false;

  $: if (open) loadStats();

  // The fields typed in since the sheet opened: a read never replaces them.
  const touched = new Set();
  // quiet: read again after a sync, while the sheet is open; a quiet read
  // that fails keeps what is shown. Only the newest read sets it.
  const newest = newestRead();
  let openReadOut = false;
  async function loadStats({ quiet = false } = {}) {
    const isNewest = newest();
    if (!quiet) touched.clear();
    quiet = quiet && !openReadOut; // the opening read is still out: this one stands in for it
    if (!quiet) openReadOut = true;
    let read = null;
    try {
      const res = await fetch(`/api/body-stats/${$currentDate}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        // See BodyStatsWidget.svelte's load() for the wire-shape rationale
        // (issue #80): the actual measurements sit one level deeper, at
        // data.stats.stats, not data.stats itself.
        const raw = typeof data.stats === 'string' ? JSON.parse(data.stats) : data.stats;
        read = raw?.stats ?? raw ?? {};
      }
    } catch { /* read stays null */ }
    if (!isNewest()) return;
    openReadOut = false;
    if (!open || (read === null && quiet)) return;
    const next = { ...(read || {}) };
    for (const id of touched) next[id] = stats[id];
    stats = next;
  }
  // A sync that brought body stats (logged on the web while this is open)
  // fills the fields you haven't typed in.
  onMount(() => onSyncChanges(() => { if (open) loadStats({ quiet: true }); }, ['bodyStats']));

  // Close from backdrop, X or back. Typed-in values ask first; save success
  // sets open = false directly and clears touched, so it never prompts.
  let closing = false;
  async function close(after) {
    if (closing || saving) return;
    if (touched.size > 0) {
      closing = true;
      let ok = false;
      try {
        ok = await confirmDialog({
          title: $_('diary_extra.body_stats_discard_title'),
          message: $_('diary_extra.body_stats_discard_message'),
          confirmText: $_('diary_extra.body_stats_discard_confirm'),
          cancelText: $_('diary_extra.body_stats_keep_editing'),
          dangerous: true,
        });
      } finally { closing = false; }
      if (!ok || !open) return;
    }
    open = false;
    if (typeof after === 'function') after();
  }

  async function save() {
    saving = true;
    try {
      const res = await fetch(`/api/body-stats/${$currentDate}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stats }),
      });
      if (!res.ok) throw new Error($_('diary_extra.body_stats_save_failed'));
      // Only a weight typed in this sheet, not one merely loaded from the day.
      if (touched.has('weight')) await adoptLoggedWeight($currentDate, stats.weight, $weightUnit);
      showSuccess($_('diary_extra.body_stats_saved'));
      // Notify the desktop rail widget so it can reload its summary
      // view without a page nav.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('lt:body-stats-saved'));
      }
      touched.clear();
      open = false;
    } catch(e) {
      showError(e.message);
    }
    saving = false;
  }
</script>

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div use:portal class="sheet-backdrop" on:click={() => close()} use:closeOnBack={() => close()} use:trapFocus={{ onEscape: () => close() }}>
    <div class="bs-sheet" role="dialog" aria-modal="true" aria-label={$_('diary_extra.body_stats_title')} on:click|stopPropagation on:keydown={() => {}}>
      <div class="sheet-handle"></div>
      <div class="sheet-header-row">
        <h3 class="sheet-title">{$_('diary_extra.body_stats_title')}</h3>
        <span class="sheet-date">{_fmtDate($currentDate)}</span>
        <button class="sheet-close" on:click={() => close()} aria-label={$_('common.close')} title={$_('common.close')}>
          <span class="material-symbols-rounded" aria-hidden="true">close</span>
        </button>
      </div>
      <div class="bs-sheet-body">
        <div class="bs-grid">
          {#each visibleStats as stat (stat.id)}
            <div>
              <label class="form-label">{$_(stat.labelKey)} <span class="unit">({getUnit(stat.id)})</span></label>
              <input class="input" type="number" step="0.1" min="0"
                bind:value={stats[stat.id]} on:input={() => touched.add(stat.id)} placeholder="—" />
            </div>
          {/each}
        </div>

        {#if visibleStats.length === 0}
          <p class="bs-empty">{$_('diary_extra.body_stats_none_enabled')}</p>
        {/if}

        <!-- Progress photo for this same date. The full timeline and the
             before/after comparison live on the Progress page; this is
             just the "while I'm logging today" shortcut. -->
        <div class="bs-photo-row">
          <button class="btn btn-secondary bs-photo-btn" disabled={photoUploading} on:click={() => photoInput?.click()}>
            <span class="material-symbols-rounded" aria-hidden="true">add_a_photo</span>
            {photoUploading ? $_('progress.adding') : $_('progress.add_photo')}
          </button>
          <button class="bs-photo-link" on:click={() => close(() => push('/progress'))}>
            {$_('progress.view_timeline')}
          </button>
        </div>
        <input type="file" accept="image/*" bind:this={photoInput} on:change={onPhotoFile} style="display:none" />
      </div>
      <div class="bs-sheet-footer">
        <button class="btn btn-primary w-full" on:click={save} disabled={saving}>
          {saving ? $_('common.saving') : $_('common.save')}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .sheet-backdrop {
    position: fixed; inset: 0; z-index: 200;
    background: rgba(0,0,0,0.5);
    display: flex; align-items: flex-end;
  }
  .sheet-handle { width: 36px; height: 4px; background: var(--border); border-radius: 2px; margin: 10px auto 0; }
  .sheet-header-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px 4px; }
  .sheet-title { font-size: 17px; font-weight: 700; margin: 0; flex: 1; }
  .sheet-close {
    background: none; border: none; cursor: pointer;
    color: var(--text-3); padding: 4px;
    display: flex; align-items: center; justify-content: center;
    border-radius: var(--radius-sm);
  }
  .sheet-close:hover { color: var(--text-1); background: var(--surface-2); }
  .sheet-close .material-symbols-rounded { font-size: 22px; }
  .sheet-date { font-size: 13px; color: var(--text-3); }

  .bs-sheet {
    background: var(--surface-1);
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    width: 100%; max-width: 600px; margin: 0 auto;
    padding-bottom: var(--safe-bottom);
    /* Never taller than the screen above the keyboard, and never up under
       the status bar. With no cap, the keyboard the fields open pushed the
       sheet's top (and its close button) under the status bar (same as
       NutriTrace #228). 90dvh matches the shared Sheet; the safe-top term
       keeps it clear where the status bar is taller than the other 10%. */
    max-height: min(90dvh, calc(100dvh - var(--safe-top) - 8px));
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  /* The title and close button stay in reach when the fields scroll. */
  .bs-sheet .sheet-header-row {
    position: sticky; top: 0; z-index: 1;
    background: var(--surface-1);
  }
  .bs-sheet-body { padding: 8px 20px 0; }
  .bs-photo-row {
    display: flex; align-items: center; gap: 10px;
    margin-top: 14px; flex-wrap: wrap;
  }
  .bs-photo-btn { flex: 1; min-width: 160px; }
  .bs-photo-link {
    background: none; border: none; padding: 4px 2px;
    font-size: 12px; color: var(--accent-ink); cursor: pointer;
  }
  .bs-sheet-footer { padding: 16px 20px; }
  .bs-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .form-label {
    font-size: 13px; font-weight: 600; color: var(--text-2);
    margin-bottom: 6px; display: block;
  }
  .input {
    width: 100%;
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: var(--radius-md); padding: 10px 14px;
    color: var(--text-1); font-size: 14px; font-family: inherit;
    outline: none;
  }
  .input:focus { border-color: var(--accent); }
  .w-full { width: 100%; }
  .bs-empty {
    text-align: center; padding: 24px 0;
    font-size: 13px; color: var(--text-3); line-height: 1.5;
    grid-column: 1 / -1;
  }

</style>
