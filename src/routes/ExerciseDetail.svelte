<script>
  import { resolveAssetUrl } from '../lib/platform.js';
  import { failedMedia, mediaFailed, workingMedia } from '../lib/media-fallback.js';
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { _ } from 'svelte-i18n';
  import { LtApi } from '../lib/api.js';
  import { onSyncChanges, newestRead } from '../lib/sync-refresh.js';
  import { weightUnit, exerciseDistanceUnits } from '../stores/settings.js';
  import { setKind, SET_TYPE_FIELD, fmtSetAmount, fromMeters, distanceUnitOf, setReps } from '../lib/workout.js';
  import { detectStall } from '../lib/progression.js';
  import { exerciseWeightPr, isAssisted, sessionE1rms } from '../lib/history-set.js';
  import { showError, showSuccess } from '../stores/toast.js';
  import { confirmDialog } from '../stores/confirmDialog.js';
  import ExerciseInfo from '../components/exercises/ExerciseInfo.svelte';
  import ExerciseEditor from '../components/exercises/ExerciseEditor.svelte';
  import Spinner from '../components/ui/Spinner.svelte';
  import { findSimilarExercises } from '../lib/exerciseSimilarity.js';
  import { exportExercise } from '../lib/exerciseShare.js';

  let exporting = false;
  async function handleExport() {
    if (!exercise || exporting) return;
    exporting = true;
    try { await exportExercise(exercise); }
    catch (e) { showError(e.message || 'Export failed'); }
    exporting = false;
  }

  let showEditor = false;

  $: isCustom = exercise && !exercise.is_global;

  async function onEditorSaved() {
    // Refresh the exercise after a save so changes are visible immediately.
    await load({ quiet: true });
  }

  async function removeExercise() {
    if (!await confirmDialog({
      title: $_('exercise_detail.confirm.delete_title', { values: { name: exercise.name } }),
      // History is one entry per workout. Empty also covers a failed load.
      message: history.length
        ? $_('exercise_detail.confirm.delete_msg_used', { values: { count: history.length } })
        : $_('exercise_detail.confirm.delete_msg'),
      confirmText: $_('common.delete'), dangerous: true,
    })) return;
    try {
      await LtApi.deleteExercise(exercise.id);
      showSuccess($_('exercise_detail.deleted'));
      push('/exercises');
    } catch(e) { showError(e.message); }
  }

  export let params = {};

  let exercise = null;
  let history = [];
  let loading = true;
  let loadError = '';

  let similar = [];

  // Stalled-lift hint: rep lifts only, dismissed per exercise until the next session.
  let stallDismissed = '';
  const stallKey = (id) => `lt:stall-dismissed:${id}`;
  $: if (exercise?.id != null) { try { stallDismissed = localStorage.getItem(stallKey(exercise.id)) || ''; } catch { stallDismissed = ''; } }
  $: stall = (!loading && exercise && !detailTimed && history.length)
    ? detectStall(history, { unit: $weightUnit === 'lbs' ? 'lbs' : 'kg', equipment: exercise.equipment }) : null;
  $: showStall = stall && stall.date !== stallDismissed;
  function dismissStall() {
    stallDismissed = stall.date;
    try { localStorage.setItem(stallKey(exercise.id), stall.date); } catch { /* private mode */ }
  }

  async function loadSimilar() {
    if (!exercise || !(exercise.primary_muscles || []).length) { similar = []; return; }
    try {
      const library = await LtApi.getExercises();
      similar = findSimilarExercises(exercise, library, 8);
    } catch { similar = []; }
  }
  $: if (exercise) loadSimilar();

  // quiet: read again after a sync, without the loading state; a quiet read
  // that fails keeps what is shown. Only the newest read sets it.
  const newest = newestRead();
  async function load({ quiet = false } = {}) {
    const isNewest = newest();
    quiet = quiet && !loading; // the first read is still out: this one speaks if it fails
    if (!quiet) { loading = true; loadError = ''; }
    try {
      const got = await LtApi.getExercise(params.id);
      // History is best-effort \u2014 if it fails, the exercise still renders.
      let past = null;
      try { past = await LtApi.getWorkoutHistory(params.id); }
      catch { past = quiet ? null : []; }
      if (isNewest() && (got || !quiet)) {
        exercise = got;
        if (past) history = past;
      }
    } catch(e) {
      if (isNewest() && !quiet) {
        loadError = e.message || 'Could not load exercise';
        showError(loadError);
      }
    }
    if (isNewest()) loading = false;
  }

  // The router keeps this component when only :id changes: reload for the new one.
  let loadedId;
  function showId() {
    exercise = null; history = []; similar = []; showEditor = false; syncWaiting = false;
    load();
  }
  $: if (params.id !== loadedId) { loadedId = params.id; showId(); }
  // A sync that changed this exercise, or the workouts its history is made
  // of, shows here at once. Not under the editor: opening it fills it from
  // the exercise, so a new copy would wipe what you've typed; the page reads
  // again once it closes. An exercise deleted elsewhere stays as it is shown.
  let syncWaiting = false;
  onMount(() => onSyncChanges(() => { if (showEditor) syncWaiting = true; else load({ quiet: true }); }, ['exercises', 'workouts']));
  $: if (!showEditor && syncWaiting) { syncWaiting = false; load({ quiet: true }); }

  // Timed exercise (issue #89), or distance or calorie one (issue #119):
  // judged by what the most recent session was, so an exercise switched to
  // another kind shows that kind's record and chart.
  $: detailKind = (() => {
    const latest = history.find(h => (h.sets || []).some(s => s.completed && !s.warmup));
    if (!latest) return 'reps';
    const kinds = (latest.sets || []).filter(s => s.completed).map(s => setKind({ set_type: latest.set_type }, s));
    return kinds.find(k => k !== 'reps') || 'reps';
  })();
  $: detailTimed = detailKind !== 'reps';
  $: detailUnit = distanceUnitOf({ exercise_id: exercise?.id, exercise_name: exercise?.name, distance_unit: history.find(h => h.distance_unit)?.distance_unit },
    $weightUnit === 'lbs', $exerciseDistanceUnits);
  const _amountOf = (s) => Number(s?.[SET_TYPE_FIELD[detailKind]]) || 0;
  // A chart value as text, in the exercise's terms.
  const _fmtPoint = (v) => (detailKind === 'distance' ? `${v} ${detailUnit}`
    : fmtSetAmount(detailKind, { [SET_TYPE_FIELD[detailKind]]: v }, detailUnit));

  $: pr = detailTimed ? (() => {
    let top = 0, atWeight = 0, prDate = '', best = null;
    for (const h of history) {
      for (const s of h.sets || []) {
        if (!s.completed || s.warmup || setKind({ set_type: h.set_type }, s) !== detailKind) continue;
        const d = _amountOf(s);
        if (d > top || (d === top && (s.weight || 0) > atWeight)) { top = d; atWeight = s.weight || 0; prDate = h.date; best = s; }
      }
    }
    if (!top) return null;
    const amount = fmtSetAmount(detailKind, best, detailUnit);
    return { label: atWeight ? `${amount} @ ${atWeight} ${$weightUnit}` : amount, date: prDate };
  })() : exerciseWeightPr(history, $weightUnit, (v, u) => $_('exercise_info.e1rm', { values: { value: v, unit: u } }));

  // Per-session top set for the inline progress chart. Oldest first so the
  // chart reads left-to-right chronologically. Limited to the last 24
  // sessions so the SVG stays readable on small phones.
  // Top set | Est. 1RM toggle: rep exercises with 2+ estimable sessions
  // (counted before the 24 cap). Back to top set when the exercise changes.
  let chartMode = 'top';
  let _modeFor = params.id;
  $: if (params.id !== _modeFor) { _modeFor = params.id; chartMode = 'top'; }
  $: e1rmSeries = detailTimed || isAssisted(exercise) ? [] : sessionE1rms(history);
  $: canE1rm = e1rmSeries.length >= 2;
  $: showE1rm = canE1rm && chartMode === 'e1rm';

  $: progressPoints = showE1rm
    ? e1rmSeries.slice(-24).map(p => ({ date: p.date, weight: p.e1rm, reps: 0 }))
    : (() => {
    const arr = [];
    for (const h of [...history].reverse()) {  // oldest first
      let top = 0, topReps = 0;
      for (const s of (h.sets || [])) {
        if (!s.completed || s.warmup) continue;
        // Plot the same kind of set the header describes: longest hold,
        // distance or most calories, else the heaviest set.
        if (setKind({ set_type: h.set_type }, s) !== detailKind) continue;
        let v = detailTimed ? _amountOf(s) : (s.weight || 0);
        if (detailKind === 'distance') v = fromMeters(v, detailUnit) || 0;
        if (v > top) { top = v; topReps = setReps(s) || 0; }
      }
      if (top > 0) arr.push({ date: h.date, weight: top, reps: topReps });
    }
    return arr.slice(-24);
  })();
  $: progressSvg = (() => {
    if (progressPoints.length < 2) return null;
    const W = Math.max(progressPoints.length * 24, 200);
    const H = 100;
    const PAD_Y = 12;
    const min = Math.min(...progressPoints.map(p => p.weight));
    const max = Math.max(...progressPoints.map(p => p.weight));
    const range = Math.max(1, max - min);
    const pts = progressPoints.map((p, i) => {
      const x = (i / Math.max(1, progressPoints.length - 1)) * (W - 16) + 8;
      const y = H - PAD_Y - ((p.weight - min) / range) * (H - PAD_Y * 2);
      return { x, y, ...p };
    });
    return { W, H, pts, min, max };
  })();

  function logToday() {
    if (!exercise) return;
    // Stash a minimal payload for Diary's onMount to pick up; full picker
    // data shape isn't required since addExercise reads only id / name /
    // category / equipment / muscles for display + history lookup.
    try {
      sessionStorage.setItem('lt:diary-add-exercise', JSON.stringify({
        id: exercise.id,
        name: exercise.name,
        category: exercise.category,
        equipment: exercise.equipment,
        primary_muscles: exercise.primary_muscles,
        secondary_muscles: exercise.secondary_muscles,
        img_url: exercise.img_url,
        gif_url: exercise.gif_url,
      }));
    } catch {}
    push('/');
  }
</script>

<div class="page">
  <header class="page-header ed-header">
    <button class="back-btn" on:click={() => window.history.length > 1 ? window.history.back() : push('/exercises')} aria-label={$_('common.back')}>
      <span class="material-symbols-rounded">arrow_back</span>
    </button>
    <h1>{exercise?.name || $_('routes.exercise_detail.title')}</h1>
    <div class="ed-actions">
    {#if exercise}
      <button class="header-btn" on:click={handleExport} disabled={exporting} title={$_('exercise_detail.share_json')} aria-label={$_('exercise_detail.share_json')}>
        <span class="material-symbols-rounded">{exporting ? 'hourglass_top' : 'share'}</span>
      </button>
    {/if}
    {#if isCustom}
      <button class="header-btn" on:click={() => showEditor = true} title={$_('common.edit')} aria-label={$_('exercise_detail.edit_exercise')}>
        <span class="material-symbols-rounded">edit</span>
      </button>
      <button class="header-btn danger" on:click={removeExercise} title={$_('common.delete')} aria-label={$_('exercise_detail.delete_exercise')}>
        <span class="material-symbols-rounded">delete</span>
      </button>
    {/if}
    </div>
  </header>

  <ExerciseEditor bind:open={showEditor} {exercise} on:saved={onEditorSaved} />

  {#if loading}
    <Spinner block label={$_('exercise_detail.loading')} />
  {:else if exercise}
    <div class="content">
      <button class="log-today-btn" on:click={logToday}>
        <span class="material-symbols-rounded">add_circle</span>
        {$_('exercise_detail.log_today')}
      </button>

      <ExerciseInfo {exercise} {pr} {history} />

      {#if showStall}
        <div class="stall-note" role="status">
          <span class="material-symbols-rounded" aria-hidden="true">info</span>
          <div class="stall-text">
            <strong>{$_('exercise_detail.stall_title', { values: { days: stall.days } })}</strong>
            <span>{$_('exercise_detail.stall_body', { values: { sessions: stall.sessions, weight: stall.suggestedWeight, unit: $weightUnit } })}</span>
          </div>
          <button class="stall-dismiss" on:click={dismissStall} aria-label={$_('exercise_detail.stall_dismiss')}>
            <span class="material-symbols-rounded" aria-hidden="true">close</span>
          </button>
        </div>
      {/if}

      {#if progressSvg}
        <div class="progress-card">
          <div class="progress-head">
            <h3 class="progress-title">{showE1rm ? $_('exercise_detail.e1rm_over_time') : detailKind === 'time' ? $_('exercise_detail.longest_hold_over_time')
              : detailKind === 'distance' ? $_('exercise_detail.longest_distance_over_time')
              : detailKind === 'calories' ? $_('exercise_detail.most_calories_over_time')
              : $_('exercise_detail.top_set_over_time')}</h3>
            <span class="progress-meta">{$_('exercise_detail.sessions_count', { values: { count: progressPoints.length } })}</span>
          </div>
          {#if canE1rm}
            <div class="chart-mode" role="group" aria-label={$_('exercise_detail.chart_mode')}>
              <button type="button" class="chart-mode-btn" class:active={!showE1rm} aria-pressed={!showE1rm}
                on:click={() => chartMode = 'top'}>{$_('exercise_detail.mode_top_set')}</button>
              <button type="button" class="chart-mode-btn" class:active={showE1rm} aria-pressed={showE1rm}
                on:click={() => chartMode = 'e1rm'}>{$_('exercise_detail.mode_e1rm')}</button>
            </div>
          {/if}
          <svg class="progress-svg" viewBox="0 0 {progressSvg.W} {progressSvg.H}" preserveAspectRatio="none">
            <polyline fill="none" stroke="var(--accent)" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"
              points={progressSvg.pts.map(p => `${p.x},${p.y}`).join(' ')} />
            <!-- Round-capped strokes, not circles: the chart stretches to its box,
                 which squashed circles into ovals (issue #131). -->
            <path d={progressSvg.pts.map(p => `M${p.x} ${p.y}h0.01`).join('')} fill="none"
              stroke="var(--accent)" stroke-width="7" stroke-linecap="round" vector-effect="non-scaling-stroke" />
          </svg>
          <div class="progress-footer">
            <span>{progressSvg.pts[0].date} · {detailTimed ? _fmtPoint(progressSvg.pts[0].weight) : `${progressSvg.pts[0].weight} ${$weightUnit}`}</span>
            <span>{progressSvg.pts.at(-1).date} · {detailTimed ? _fmtPoint(progressSvg.pts.at(-1).weight) : `${progressSvg.pts.at(-1).weight} ${$weightUnit}`}</span>
          </div>
          {#if showE1rm}<p class="chart-hint">{$_('exercise_detail.e1rm_hint')}</p>{/if}
        </div>
      {/if}

      {#if similar.length > 0}
        <div class="similar-section">
          <h3 class="similar-title">{$_('exercise_detail.similar_exercises')}</h3>
          <p class="similar-sub">Alternatives that train the same primary muscles — useful when equipment is taken or you're training somewhere new.</p>
          <div class="similar-grid">
            {#each similar as s (s.id)}
              <button class="similar-card" on:click={() => push(`/exercise/${s.id}`)}>
                {#if workingMedia($failedMedia, s.gif_url, s.img_url)}
                  <img class="similar-img" src={resolveAssetUrl(workingMedia($failedMedia, s.gif_url, s.img_url))} alt="" loading="lazy" data-media={workingMedia($failedMedia, s.gif_url, s.img_url)} on:error={(e) => mediaFailed(e.currentTarget.dataset.media)} />
                {:else}
                  <span class="similar-img-fallback material-symbols-rounded">fitness_center</span>
                {/if}
                <div class="similar-info">
                  <span class="similar-name">{s.name}</span>
                  {#if (s.equipment || []).length}
                    <span class="similar-equip">{(s.equipment || []).slice(0, 2).join(', ')}</span>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <div class="load-error">
      <span class="material-symbols-rounded">error_outline</span>
      <p>{$_('exercise_detail.load_failed')}</p>
      {#if loadError}<p class="err-detail">{loadError}</p>{/if}
      <div class="err-actions">
        <button class="btn btn-primary" on:click={load}>{$_('exercise_detail.try_again')}</button>
        <button class="btn btn-secondary" on:click={() => push('/exercises')}>{$_('exercise_detail.back_to_exercises')}</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .page { min-height: 100dvh; background: var(--bg); padding-bottom: calc(var(--nav-h) + var(--safe-bottom) + var(--mini-player-h, 0px) + 16px); }
  .back-btn {
    background: none; border: none; cursor: pointer; color: var(--text-2);
    padding: 6px; border-radius: var(--radius-sm); display: flex;
  }
  .header-btn {
    background: none; border: none; cursor: pointer; color: var(--text-3);
    padding: 6px; border-radius: var(--radius-sm); display: flex;
  }
  .ed-actions { display: contents; }
  /* Narrow phones: back + title share row 1, actions drop to row 2 so the name stays readable. */
  @media (max-width: 480px) {
    .ed-header { flex-wrap: wrap; row-gap: 0; }
    .ed-header h1 { flex: 1 1 calc(100% - 48px); }
    .ed-actions { display: flex; gap: 8px; margin-left: auto; }
  }
  .header-btn:hover { color: var(--text-1); background: var(--surface-2); }
  .header-btn.danger:hover { color: var(--danger); background: rgba(255,92,92,0.1); }
  .content { padding: 16px var(--page-px); }

  /* Log Today shortcut — direct path from this exercise to today's diary.
     Saves a member from having to nav → Diary → Add Exercise → search. */
  .log-today-btn {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    width: 100%; padding: 12px 16px;
    background: var(--accent-dim); color: var(--accent-ink);
    border: 1px solid var(--accent);
    border-radius: var(--radius-md);
    font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit;
    margin-bottom: 16px;
    transition: background var(--dur-fast), transform var(--dur-fast);
  }
  .log-today-btn:hover { background: color-mix(in srgb, var(--accent) 25%, transparent); }
  .log-today-btn:active { transform: scale(0.98); }
  .log-today-btn .material-symbols-rounded { font-size: 20px; }

  /* Inline progress chart — top set over time, sourced from the existing
     history list. Same SVG pattern as Stats > Exercise Progress but smaller
     and embedded here so the user doesn't have to nav for a quick glance. */
  .stall-note {
    display: flex; align-items: flex-start; gap: 10px; margin-top: 16px;
    padding: 10px 12px; background: var(--surface-1); border: 1px solid var(--border);
    border-radius: var(--radius-lg); color: var(--text-2); font-size: 13px;
  }
  .stall-text { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .stall-text strong { color: var(--text-1); }
  .stall-dismiss { background: none; border: 0; padding: 0; color: var(--text-3); cursor: pointer; }
  .progress-card {
    margin-top: 24px;
    padding: 14px 16px;
    background: var(--surface-1); border: 1px solid var(--border);
    border-radius: var(--radius-lg);
  }
  .progress-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .progress-title { font-size: 14px; font-weight: 700; color: var(--text-1); margin: 0; }
  .progress-meta  { font-size: 12px; color: var(--text-3); }
  .progress-svg   { width: 100%; height: 100px; display: block; }
  .progress-footer {
    display: flex; justify-content: space-between;
    font-size: 11px; color: var(--text-3); margin-top: 6px;
    font-variant-numeric: tabular-nums;
  }
  .chart-mode { display: inline-flex; gap: 2px; padding: 2px; margin-bottom: 8px; background: var(--surface-2); border-radius: var(--radius-md, 8px); }
  .chart-mode-btn { border: 0; background: transparent; color: var(--text-3); font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 6px; cursor: pointer; }
  .chart-mode-btn.active { background: var(--accent-ink); color: var(--accent-text); }
  .chart-hint { font-size: 11px; color: var(--text-3); margin: 6px 0 0; }
  .loading { text-align: center; padding: 48px; color: var(--text-3); }
  .load-error { text-align: center; padding: 48px 24px; color: var(--text-3); }
  .load-error .material-symbols-rounded { font-size: 48px; color: var(--danger); margin-bottom: 12px; }
  .err-detail { font-size: 12px; opacity: 0.7; margin: 4px 0 16px; }
  .err-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }

  /* Similar exercises section */
  .similar-section { margin-top: 32px; }
  .similar-title { font-size: 18px; font-weight: 700; color: var(--text-1); margin: 0 0 4px; }
  .similar-sub   { font-size: 12px; color: var(--text-3); margin: 0 0 14px; line-height: 1.5; }
  .similar-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 10px;
  }
  .similar-card {
    display: flex; flex-direction: column; gap: 8px;
    padding: 10px; border-radius: var(--radius-md);
    background: var(--surface-1); border: 1px solid var(--border);
    color: var(--text-1); font-family: inherit; text-align: left;
    cursor: pointer; transition: all var(--dur-fast);
  }
  .similar-card:hover { background: var(--surface-2); border-color: var(--accent); }
  .similar-img {
    width: 100%; aspect-ratio: 4 / 3; object-fit: cover;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }
  .similar-img-fallback {
    width: 100%; aspect-ratio: 4 / 3; display: flex;
    align-items: center; justify-content: center;
    background: var(--surface-2); border-radius: var(--radius-sm);
    color: var(--text-3); font-size: 28px;
  }
  .similar-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .similar-name {
    font-size: 13px; font-weight: 600; color: var(--text-1);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .similar-equip { font-size: 11px; color: var(--text-3); }
</style>
