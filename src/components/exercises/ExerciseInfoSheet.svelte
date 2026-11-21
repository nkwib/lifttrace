<script>
  import { createEventDispatcher } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { LtApi } from '../../lib/api.js';
  import { weightUnit } from '../../stores/settings.js';
  import { exerciseWeightPr } from '../../lib/history-set.js';
  import Sheet from '../ui/Sheet.svelte';
  import ExerciseInfo from './ExerciseInfo.svelte';

  /** Pass one of: `exercise` (full object), `exerciseId` (we fetch), or `exerciseName` (we search). */
  export let open = false;
  export let exercise = null;
  export let exerciseId = null;
  export let exerciseName = null;
  /** If true, show an "Add this exercise" primary button — used in the pick flow. */
  export let showAddButton = false;

  const dispatch = createEventDispatcher();

  let loaded = null;
  let history = [];
  let loading = false;
  let notFound = false;

  $: if (open) loadIfNeeded();

  async function loadIfNeeded() {
    notFound = false;
    if (exercise) {
      loaded = exercise;
      try { history = await LtApi.getWorkoutHistory(exercise.id); } catch { history = []; }
      return;
    }
    if (exerciseId) {
      loading = true;
      try {
        loaded = await LtApi.getExercise(exerciseId);
        history = await LtApi.getWorkoutHistory(exerciseId);
      } catch(e) {
        console.error('[ExerciseInfoSheet] fetch by id failed', e);
        loaded = null;
      }
      loading = false;
      return;
    }
    if (exerciseName) {
      loading = true;
      try {
        const results = await LtApi.getExercises({ search: exerciseName, limit: 20 });
        const lc = exerciseName.toLowerCase().trim();
        const exact = results.find(r => r.name?.toLowerCase().trim() === lc);
        loaded = exact || results[0] || null;
        if (loaded) {
          try { history = await LtApi.getWorkoutHistory(loaded.id); } catch { history = []; }
        } else {
          notFound = true;
        }
      } catch(e) {
        console.error('[ExerciseInfoSheet] search by name failed', e);
        loaded = null;
        notFound = true;
      }
      loading = false;
    }
  }

  $: pr = exerciseWeightPr(history, $weightUnit, (v, u) => $_('exercise_info.e1rm', { values: { value: v, unit: u } }));

  function onAdd() {
    dispatch('add', loaded);
    open = false;
  }
</script>

<Sheet bind:open title={loaded?.name || $_('exercise_info.fallback_title')} height="full">
  <div class="info-sheet-body">
    {#if loading}
      <div class="loading">{$_('common.loading')}</div>
    {:else if loaded}
      <ExerciseInfo exercise={loaded} {pr} {history} />
      {#if showAddButton}
        <button class="btn btn-primary add-btn" on:click={onAdd}>
          <span class="material-symbols-rounded" aria-hidden="true">add_circle</span>
          {$_('exercise_info.add_this')}
        </button>
      {/if}
    {:else if notFound && exerciseName}
      <div class="not-linked">
        <span class="material-symbols-rounded not-linked-icon" aria-hidden="true">link_off</span>
        <div class="not-linked-title">{$_('exercise_info.not_in_library', { values: { name: exerciseName } })}</div>
        <div class="not-linked-hint">{$_('exercise_info.free_text_hint')}</div>
        <button class="btn btn-primary replace-btn" on:click={() => { dispatch('replace'); open = false; }}>
          <span class="material-symbols-rounded" aria-hidden="true">swap_horiz</span>
          {$_('exercise_info.replace_with_library')}
        </button>
      </div>
    {:else}
      <div class="loading">{$_('exercise_info.load_failed')}</div>
    {/if}
  </div>
</Sheet>

<style>
  .info-sheet-body {
    padding: 0 4px 8px;
    display: flex; flex-direction: column; gap: 4px;
  }
  .loading { text-align: center; padding: 32px; color: var(--text-3); }
  .add-btn {
    width: 100%; height: 48px; margin-top: 8px;
    justify-content: center;
  }
  .add-btn .material-symbols-rounded { font-size: 20px; }

  .not-linked {
    display: flex; flex-direction: column; align-items: center;
    padding: 40px 24px 24px; text-align: center; gap: 10px;
  }
  .not-linked-icon { font-size: 48px; color: var(--text-3); margin-bottom: 4px; }
  .not-linked-title { font-size: 16px; font-weight: 700; color: var(--text-1); }
  .not-linked-hint { font-size: 13px; color: var(--text-3); line-height: 1.5; max-width: 320px; }
  .replace-btn {
    width: 100%; max-width: 320px; height: 48px; margin-top: 8px;
    justify-content: center; gap: 6px;
  }
  .replace-btn .material-symbols-rounded { font-size: 20px; }
</style>
