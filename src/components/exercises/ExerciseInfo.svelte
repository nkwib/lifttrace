<script>
  import { resolveAssetUrl } from '../../lib/platform.js';
  import { failedMedia, mediaFailed } from '../../lib/media-fallback.js';
  import { _ } from 'svelte-i18n';
  import { fmtHistorySet, historyHasRepSets, isAssisted, repMaxes } from '../../lib/history-set.js';
  import { onDestroy } from 'svelte';
  import { weightUnit, exerciseDistanceUnits, exerciseNotes } from '../../stores/settings.js';
  import { cleanNote, withNote, EXERCISE_NOTE_MAX } from '../../lib/exercise-notes.js';
  /**
   * Shared exercise detail content — reused by the full ExerciseDetail
   * page and the ExerciseInfoSheet bottom-sheet preview. Takes an
   * exercise object and optionally a personal-record/history block.
   */
  export let exercise = null;
  export let pr = null;          // { weight, date, unit } or { label, sub?, date }, or null
  export let history = null;     // [{ date, sets: [...] }] or null

  let showAll = false;
  let lastId = null;
  $: if ((exercise?.id ?? null) !== lastId) { lastId = exercise?.id ?? null; showAll = false; }
  // Standing personal note, saved on blur and on unmount (the sheet closing).
  let noteDraft = '';
  let noteId = null;
  $: if ((exercise?.id ?? null) !== noteId) {
    saveNote();
    noteId = exercise?.id ?? null;
    noteDraft = noteId != null ? ($exerciseNotes?.[noteId] || '') : '';
  }
  function saveNote() {
    if (noteId == null) return;
    const cur = $exerciseNotes?.[noteId] || '';
    if (cleanNote(noteDraft) === cur) return;
    exerciseNotes.update(m => withNote(m, noteId, noteDraft));
  }
  onDestroy(saveNote);
  $: rows = history || [];
  $: repMaxRows = isAssisted(exercise) ? [] : repMaxes(history);
  $: shown = showAll ? rows : rows.slice(0, 10);
  $: ctx = { exerciseId: exercise?.id, exerciseName: exercise?.name, imperial: $weightUnit === 'lbs', distanceUnits: $exerciseDistanceUnits };
</script>

{#if exercise}
  <!-- Media -->
  {#if exercise.video_url}
    <div class="media-card">
      {#if /youtube\.com|youtu\.be/.test(exercise.video_url)}
        <iframe class="media-video" src={exercise.video_url.replace('watch?v=', 'embed/')} title="Demo" allowfullscreen frameborder="0"></iframe>
      {:else}
        <video class="media-video" src={resolveAssetUrl(exercise.video_url)} poster={resolveAssetUrl(exercise.img_url || exercise.gif_url) || undefined} controls playsinline></video>
      {/if}
      {#if exercise.source}<span class="media-source">via {exercise.source}</span>{/if}
    </div>
  {:else if exercise.gif_url && exercise.img_url && exercise.gif_url !== exercise.img_url && /\.(jpg|jpeg|png|webp)$/i.test(exercise.gif_url) && !$failedMedia.has(exercise.gif_url) && !$failedMedia.has(exercise.img_url)}
    <div class="media-card swap">
      <img class="swap-img frame-a" src={resolveAssetUrl(exercise.img_url)} alt="Start position" on:error={() => mediaFailed(exercise.img_url)} />
      <img class="swap-img frame-b" src={resolveAssetUrl(exercise.gif_url)} alt="End position" on:error={() => mediaFailed(exercise.gif_url)} />
      {#if exercise.source}<span class="media-source">via {exercise.source}</span>{/if}
    </div>
  {:else if exercise.gif_url && !$failedMedia.has(exercise.gif_url)}
    <div class="media-card">
      <img class="media-img" src={resolveAssetUrl(exercise.gif_url)} alt={exercise.name} on:error={() => mediaFailed(exercise.gif_url)} />
      {#if exercise.source}<span class="media-source">via {exercise.source}</span>{/if}
    </div>
  {:else if exercise.img_url && !$failedMedia.has(exercise.img_url)}
    <div class="media-card">
      <img class="media-img" src={resolveAssetUrl(exercise.img_url)} alt={exercise.name} on:error={() => mediaFailed(exercise.img_url)} />
      {#if exercise.source}<span class="media-source">via {exercise.source}</span>{/if}
    </div>
  {/if}

  <!-- Category & Equipment -->
  <div class="info-row">
    {#if exercise.category}
      <span class="tag cat">{exercise.category}</span>
    {/if}
    {#each exercise.equipment || [] as eq}
      <span class="tag">{eq}</span>
    {/each}
  </div>

  <!-- Muscles -->
  {#if exercise.primary_muscles?.length}
    <div class="section">
      <h3 class="section-title">{$_('exercise_info.primary_muscles')}</h3>
      <div class="tags">
        {#each exercise.primary_muscles as m}<span class="tag muscle">{m}</span>{/each}
      </div>
    </div>
  {/if}
  {#if exercise.secondary_muscles?.length}
    <div class="section">
      <h3 class="section-title">{$_('exercise_info.secondary_muscles')}</h3>
      <div class="tags">
        {#each exercise.secondary_muscles as m}<span class="tag">{m}</span>{/each}
      </div>
    </div>
  {/if}

  {#if exercise.id != null}
    <div class="section">
      <h3 class="section-title">{$_('exercise_info.note_title')}</h3>
      <textarea class="note-input" rows="2" maxlength={EXERCISE_NOTE_MAX}
        placeholder={$_('exercise_info.note_placeholder')}
        bind:value={noteDraft} on:blur={saveNote}></textarea>
    </div>
  {/if}

  <!-- Instructions -->
  {#if exercise.instructions}
    <div class="section">
      <h3 class="section-title">{$_('exercise_info.how_to_perform')}</h3>
      <p class="instructions">{exercise.instructions}</p>
    </div>
  {/if}
  {#if exercise.tips}
    <div class="section">
      <h3 class="section-title">{$_('exercise_info.tips')}</h3>
      <p class="instructions">{exercise.tips}</p>
    </div>
  {/if}

  <!-- Personal Record (optional) -->
  {#if pr}
    <div class="pr-card">
      <span class="material-symbols-rounded pr-icon">emoji_events</span>
      <div class="pr-info">
        <span class="pr-label">{$_('exercise_info.personal_record')}</span>
        <span class="pr-value">{pr.label ?? `${pr.weight} ${pr.unit || ''}`}</span>
        {#if pr.sub}<span class="pr-sub">{pr.sub}</span>{/if}
        <span class="pr-date">{pr.date}</span>
      </div>
    </div>
  {/if}

  <!-- Rep maxes (rep-kind history only, needs 2+ distinct rows) -->
  {#if repMaxRows.length >= 2}
    <div class="section">
      <h3 class="section-title">{$_('exercise_info.rep_maxes_title')} <span class="rm-unit">({$weightUnit})</span></h3>
      <div class="rm-grid">
        {#each repMaxRows as r}
          <div class="rm-cell">
            <span class="rm-reps">{$_('exercise_info.rep_maxes_reps', { values: { count: r.reps } })}</span>
            <span class="rm-weight">{r.weight}</span>
            <span class="rm-date">{r.date}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- History (optional) -->
  {#if history && history.length > 0}
    <div class="section">
      <h3 class="section-title">{$_('exercise_info.recent_history')}</h3>
      <div class="history-list">
        {#each shown as h}
          <div class="history-row">
            <span class="hist-date">{h.date}</span>
            <span class="hist-sets">
              {#each (h.sets || []).filter(s => s.completed) as s, i}
                {#if i > 0}<span class="sep"> | </span>{/if}
                {#if s.warmup}<span class="warm" title={$_('exercise_info.warmup')}><span aria-hidden="true">{$_('exercise_info.warmup_short')}</span> {fmtHistorySet(s, h, ctx)}</span>{:else}<span>{fmtHistorySet(s, h, ctx)}</span>{/if}
              {/each}
              {#if historyHasRepSets(h)}<span class="unit">{$weightUnit}</span>{/if}
            </span>
          </div>
        {/each}
        {#if !showAll && rows.length > 10}
          <button class="show-all" on:click={() => (showAll = true)}>{$_('exercise_info.show_all', { values: { count: rows.length } })}</button>
        {/if}
      </div>
    </div>
  {/if}
{/if}

<style>
  .info-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
  .tag {
    padding: 4px 12px; border-radius: var(--radius-full);
    background: var(--surface-2); border: 1px solid var(--border);
    font-size: 12px; color: var(--text-2); text-transform: capitalize;
  }
  .tag.cat { background: var(--accent-dim); border-color: var(--accent); color: var(--accent-ink); font-weight: 600; }
  .tag.muscle { background: color-mix(in srgb, var(--lift-sets) 15%, transparent); border-color: color-mix(in srgb, var(--lift-sets) 30%, transparent); color: var(--lift-sets); }

  .section { margin-bottom: 20px; }
  .section-title { font-size: 13px; font-weight: 700; color: var(--text-2); margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.04em; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .instructions { font-size: 14px; color: var(--text-2); line-height: 1.7; margin: 0; white-space: pre-wrap; }

  .note-input {
    width: 100%; box-sizing: border-box; resize: vertical; font: inherit; font-size: 14px;
    background: var(--surface-1); border: 1px solid var(--border);
    border-radius: var(--radius-md); color: var(--text-1); padding: 10px 12px;
  }

  .pr-card {
    display: flex; align-items: center; gap: 12px;
    background: linear-gradient(135deg, rgba(255,213,79,0.1), rgba(255,213,79,0.05));
    border: 1px solid rgba(255,213,79,0.2);
    border-radius: var(--radius-lg); padding: 16px;
    margin-bottom: 20px;
  }
  .pr-icon { font-size: 32px; color: #FFD54F; }
  .pr-info { display: flex; flex-direction: column; gap: 2px; }
  .pr-label { font-size: 12px; color: var(--text-3); font-weight: 600; text-transform: uppercase; }
  .pr-value { font-size: 22px; font-weight: 700; color: #FFD54F; }
  .pr-sub   { font-size: 12px; color: var(--text-2); }
  .pr-date  { font-size: 12px; color: var(--text-3); }

  .rm-unit { text-transform: none; font-weight: 500; color: var(--text-3); }
  .rm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 6px; }
  .rm-cell {
    display: flex; flex-direction: column; gap: 2px; padding: 8px 10px;
    background: var(--surface-1); border: 1px solid var(--border); border-radius: var(--radius-md);
    font-variant-numeric: tabular-nums;
  }
  .rm-reps { font-size: 12px; color: var(--text-3); font-weight: 600; }
  .rm-weight { font-size: 16px; font-weight: 700; color: var(--text-1); }
  .rm-date { font-size: 11px; color: var(--text-3); }

  .history-list { display: flex; flex-direction: column; gap: 6px; }
  .history-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 14px;
    background: var(--surface-1); border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }
  .hist-date { font-size: 13px; font-weight: 600; color: var(--text-2); }
  .warm { opacity: 0.55; }
  .sep, .unit { color: var(--text-3); }
  .show-all {
    background: none; border: 1px solid var(--border); border-radius: var(--radius-md);
    color: var(--accent-ink); padding: 8px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
  }
  .hist-sets { font-size: 13px; color: var(--text-1); font-variant-numeric: tabular-nums; }

  /* ── Media ────────────────────────────────────────────────────────── */
  .media-card {
    position: relative;
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: var(--surface-2);
    margin-bottom: 16px;
    aspect-ratio: 4 / 3;
    max-height: 360px;
  }
  .media-img, .media-video, .swap-img {
    width: 100%; height: 100%; object-fit: contain;
    display: block;
  }
  .media-source {
    position: absolute; bottom: 8px; right: 8px;
    background: rgba(0,0,0,0.6); color: #fff;
    font-size: 10px; padding: 2px 8px;
    border-radius: var(--radius-full);
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  .media-card.swap .swap-img {
    position: absolute; inset: 0;
    animation: swap-frames 1.8s steps(1, end) infinite;
  }
  .media-card.swap .frame-a { animation-delay: 0s; }
  .media-card.swap .frame-b { animation-delay: 0.9s; }
  @keyframes swap-frames {
    0%, 50%   { opacity: 1; }
    50.01%, 100% { opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .media-card.swap .swap-img { animation: none; }
    .media-card.swap .frame-b { display: none; }
  }
</style>
