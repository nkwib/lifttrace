<script>
  /**
   * SupersetCard.svelte: a superset in the Diary, laid out the way it is
   * lifted. The exercises sit at the top (A, B, C… with their load type,
   * targets, coach notes and actions); the sets below go round by round, A
   * then B then C, so the next set is always the next row instead of a
   * scroll away. A round whose sets are all done shrinks to one line; a tap
   * opens it again.
   *
   * Which set is in which round is lib/supersetRounds.js, the rule the rest
   * timer already goes by. Every edit leaves as the same `update` event an
   * ExerciseCard sends, so rest, PRs, saving and sync are the Diary's as
   * before.
   */
  import { createEventDispatcher, onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { slide, fade } from 'svelte/transition';
  import ExerciseCard from './ExerciseCard.svelte';
  import SetRow from './SetRow.svelte';
  import LoadTypeMenu from '../ui/LoadTypeMenu.svelte';
  import { LtApi } from '../../lib/api.js';
  import { onSyncChanges } from '../../lib/sync-refresh.js';
  import { getCollapseState, setCollapsed } from '../../lib/cardCollapse.js';
  import { resolveAssetUrl } from '../../lib/platform.js';
  import {
    resolveLoadType, resolveSetType, rowShape, distanceUnitOf, fmtSetLabel, fmtSetDuration, parseDuration,
    lastCompletedSession, generateWarmupSets, volumeDelta, withSetUpdated, holdSides, progressionFor,
  } from '../../lib/workout.js';
  import { supersetRounds, withRoundAdded, memberLetter } from '../../lib/supersetRounds.js';
  import { exerciseLoadTypes, exerciseSetTypes, exerciseDistanceUnits } from '../../stores/settings.js';
  import { holdTimer, holdResult, startHold, stopHold, consumeHoldResult, holdMatches } from '../../stores/holdTimer.js';
  import { applyHold } from '../../lib/holdPhase.js';

  export let exercises = [];
  export let startIdx = 0;
  export let supersetId = null;
  export let targetSets = 1;
  export let unit = 'lbs';
  export let autoCollapse = false;
  export let date = '';
  // The workout is finished: the volume chip compares whole sessions.
  export let workoutDone = false;
  /** set uuid to clip row, for the play chip on a filmed set (issue #57). */
  export let mediaBySet = null;
  // Workout-level coach feedback array (all rows for the workout). The
  // card filters down to per-exercise notes keyed by exercise_idx so each
  // superset member shows its own notes under its row at the top.
  export let feedback = [];
  // PR flags map keyed by global exercise position (startIdx + offset).
  export let prFlagsByIdx = {};
  // Reply state passed through from Diary so the same single-source state
  // drives both the inline reply boxes inside the SupersetCard and the
  // ones outside it. Diary owns the state + functions; we just render.
  export let replyOpenId = null;
  export let replyDrafts = {};
  export let replySaving = null;
  export let onOpenReply = () => {};
  export let onSaveReply = () => {};
  export let onCancelReply = () => {};
  export let onDeleteReply = () => {};
  export let replySavedFlash = null;
  // Relative-time formatter (shared from Diary so superset members get the
  // same "3h ago" labeling on coach notes / replies that single-exercise
  // cards do). Default is a thin shim so the component still renders if
  // the prop is missed.
  function autofocus(node) { setTimeout(() => node.focus(), 0); return {}; }
  export let relTime = (t) => {
    if (!t) return '';
    const diff = Date.now() - new Date(t).getTime();
    const m = Math.round(diff / 60000);
    if (m < 60) return m <= 1 ? 'just now' : `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.round(h / 24);
    return d < 7 ? `${d}d ago` : new Date(t).toLocaleDateString();
  };

  $: rowKey = `ss:${supersetId}`;

  const dispatch = createEventDispatcher();

  $: isSingle = exercises.length <= 1;
  $: allDone = exercises.every(ex =>
    (ex.sets || []).length > 0 && (ex.sets || []).every(s => s.completed)
  );
  $: totalSets = exercises.reduce((sum, ex) => sum + (ex.sets?.length || 0), 0);
  $: completedSets = exercises.reduce((sum, ex) => sum + (ex.sets?.filter(s => s.completed).length || 0), 0);
  $: progress = totalSets === 0 ? 'none' : allDone ? 'done' : completedSets > 0 ? 'partial' : 'none';
  $: layout = supersetRounds(exercises);

  // ── Last session, per member ─────────────────────────────────────────
  // The same pick as ExerciseCard's "Last" row and auto-fill
  // (lastCompletedSession), read once per exercise and day.
  let lastSessions = {};
  const _asked = new Set();
  const _lastKey = (id, day) => `${id}|${day}`;
  async function loadLast(id, day) {
    try {
      const recent = lastCompletedSession(await LtApi.getWorkoutHistory(id), { before: day });
      lastSessions = { ...lastSessions, [_lastKey(id, day)]: recent
        ? { date: recent.date, sets: recent.completed, working: recent.working || [], set_type: recent.set_type }
        : null };
    } catch { /* keep what was shown */ }
  }
  $: if (!isSingle && date) {
    for (const ex of exercises) {
      if (ex.exercise_id == null) continue;
      const key = _lastKey(ex.exercise_id, date);
      if (!_asked.has(key)) { _asked.add(key); loadLast(ex.exercise_id, date); }
    }
  }
  // A sync that brought workouts (an earlier session logged on the web)
  // shows at once, as it does on a standalone card.
  onMount(() => onSyncChanges(() => {
    if (isSingle) return;
    for (const ex of exercises) if (ex.exercise_id != null) loadLast(ex.exercise_id, date);
  }, ['workouts']));

  // ── Each member, as its ExerciseCard would read it ───────────────────
  $: members = exercises.map((ex, m) => {
    const last = ex.exercise_id != null ? lastSessions[_lastKey(ex.exercise_id, date)] || null : null;
    const loadType = resolveLoadType(ex, ex._library_load_type ?? null, $exerciseLoadTypes);
    const setType = resolveSetType(ex, ex._library_set_type ?? null, $exerciseSetTypes, last?.sets || null, last?.set_type || null);
    const notReps = setType !== 'reps';
    const sets = ex.sets || [];
    const working = sets.filter(s => !s.warmup);
    const firstWorking = working[0];
    const workingWeight = parseFloat(firstWorking?.weight ?? ex.target_weight ?? 0) || 0;
    const cmp = last ? volumeDelta({ ...ex, load_type: loadType }, last.sets, { done: workoutDone }) : null;
    return {
      ex, m, last, loadType, setType, notReps,
      letter: memberLetter(m),
      distanceUnit: distanceUnitOf(ex, unit === 'lbs', $exerciseDistanceUnits),
      done: working.filter(s => s.completed).length,
      total: working.length,
      // Offered until the first working set is done, as after it a ramp
      // has nothing left to warm up for.
      canWarmUp: !notReps && !sets.some(s => s.warmup) && workingWeight > 0 && !working.some(s => s.completed),
      workingWeight,
      progression: notReps ? null : progressionFor(ex, last?.sets, unit),
      volumePct: cmp ? cmp.pct : null,
      volumePartial: !!cmp?.partial,
    };
  });

  /** What this member lifted in round `number` last time, "80×8", or ''. */
  function lastFor(member, number) {
    const w = member?.last?.working;
    if (!w?.length) return '';
    const s = w[number - 1];
    return s ? fmtSetLabel({ set_type: member.last.set_type }, s, member.distanceUnit) : '';
  }

  function hasTargets(mb) {
    const ex = mb.ex;
    return !!(ex.target_weight || (!mb.notReps && ex.target_reps) || (mb.setType === 'time' && ex.target_duration)
      || (mb.setType === 'distance' && ex.target_distance) || (mb.setType === 'calories' && ex.target_calories)
      || ex.notes || mb.progression || (mb.volumePct !== null && mb.volumePct !== 0) || mb.canWarmUp);
  }

  // ── Edits ────────────────────────────────────────────────────────────
  function send(m, exercise) {
    dispatch('update', { idx: startIdx + m, exercise });
  }
  function updateSet(m, setIdx, set) {
    const ex = exercises[m];
    send(m, { ...ex, sets: withSetUpdated(ex.sets || [], setIdx, set) });
  }
  function removeSet(m, setIdx) {
    const ex = exercises[m];
    send(m, { ...ex, sets: (ex.sets || []).filter((_, i) => i !== setIdx) });
  }
  function addWarmups(m) {
    const ex = exercises[m];
    const generated = generateWarmupSets(members[m].workingWeight, unit);
    if (generated.length === 0) return;
    send(m, { ...ex, sets: [...generated, ...(ex.sets || [])] });
  }
  // Every member changes at once, so it goes up as one save: one `update`
  // per member would each start from the exercises as they were.
  function addRound() {
    dispatch('updateMany', withRoundAdded(exercises).map((exercise, m) => ({ idx: startIdx + m, exercise })));
  }

  // ── Load type / tracked by (the same chooser ExerciseCard opens) ─────
  let loadMenuFor = null;
  let loadMenuAnchor = null;
  let rememberLoad = false;
  function toggleLoadMenu(e, m) {
    if (loadMenuFor === m) { loadMenuFor = null; return; }
    loadMenuAnchor = e.currentTarget.getBoundingClientRect();
    loadMenuFor = m;
  }
  function pickLoadType(nextType) {
    const m = loadMenuFor; const ex = exercises[m];
    loadMenuFor = null;
    if (!ex) return;
    send(m, { ...ex, load_type: nextType });
    if (rememberLoad && ex.exercise_id != null) {
      exerciseLoadTypes.update(curr => ({ ...(curr || {}), [ex.exercise_id]: nextType }));
    }
  }
  function pickSetType(nextType) {
    const m = loadMenuFor; const ex = exercises[m];
    loadMenuFor = null;
    if (!ex) return;
    const unitStamp = nextType === 'distance' && !ex.distance_unit ? { distance_unit: members[m].distanceUnit } : {};
    send(m, { ...ex, set_type: nextType, ...unitStamp });
    if (rememberLoad && ex.exercise_id != null) {
      exerciseSetTypes.update(curr => ({ ...(curr || {}), [ex.exercise_id]: nextType }));
    }
  }
  function pickDistanceUnit(nextUnit) {
    const m = loadMenuFor; const ex = exercises[m];
    if (!ex) return;
    send(m, { ...ex, distance_unit: nextUnit });
    if (rememberLoad && ex.exercise_id != null) {
      exerciseDistanceUnits.update(curr => ({ ...(curr || {}), [ex.exercise_id]: nextUnit }));
    }
  }
  const SET_TYPE_ICON = { time: 'timer', distance: 'route', calories: 'local_fire_department' };
  function loadLabel(loadType) {
    return loadType === 'paired' ? $_('workout_editor.load_paired')
      : loadType === 'unilateral' ? $_('workout_editor.load_unilateral')
      : $_('workout_editor.load_bilateral');
  }

  // ── Hold timer (issue #89), as ExerciseCard runs it ──────────────────
  function startHoldFor(m, setIdx) {
    const ex = exercises[m];
    const set = ex?.sets?.[setIdx];
    if (!set) return;
    const perSide = members[m].loadType === 'unilateral';
    const split = perSide ? holdSides(set) : null;
    startHold({
      date,
      exIdx: startIdx + m,
      setIdx,
      exerciseId: ex.exercise_id ?? null,
      exerciseUuid: ex.uuid || null,
      setUuid: set.uuid || null,
      exerciseName: ex.exercise_name,
      targetSec: Number(set.duration_sec) || 0,
      ...(perSide ? {
        sides: true,
        targetL: split ? split.l : (Number(set.duration_sec) || 0),
        targetR: split ? split.r : (Number(set.duration_sec) || 0),
      } : {}),
    });
  }
  // A finished hold lands through updateSet, like a tapped tick, so rest,
  // PRs and rounds behave the same. By uuid first, so a reorder mid-hold
  // still finds the set.
  $: if (!isSingle && $holdResult) {
    const r = $holdResult;
    const m = exercises.findIndex((ex, i) => holdMatches(r, { date, exIdx: startIdx + i, exercise: ex }));
    if (m >= 0) {
      const sets = exercises[m].sets || [];
      let target = r.setUuid ? sets.findIndex(s => s.uuid === r.setUuid) : -1;
      if (target < 0 && sets[r.setIdx]) target = r.setIdx;
      if (target >= 0) {
        consumeHoldResult();
        updateSet(m, target, applyHold(sets[target], r));
      }
    }
  }

  // ── Done rounds fold to one line; a tap opens one again ──────────────
  let reopened = new Set();
  let _reopenedFor = '';
  $: if (`${date}|${supersetId}` !== _reopenedFor) { _reopenedFor = `${date}|${supersetId}`; reopened = new Set(); }
  function toggleRound(key) {
    if (reopened.has(key)) reopened.delete(key); else reopened.add(key);
    reopened = reopened;
  }
  $: warmupsDone = layout.warmups.length > 0 && layout.warmups.every(w => w.set.completed);
  function summaryOf(entries) {
    return entries.map(e => `${memberLetter(e.member)} ${fmtSetLabel(exercises[e.member], e.set, members[e.member]?.distanceUnit)}`).join(' · ');
  }
  $: roundLabel = layout.current != null
    ? $_('superset_card.round_of', { values: { n: layout.current, count: layout.count } })
    : layout.count ? $_('superset_card.rounds_done') : '';

  // Auto-collapse when the whole superset is done. Signature-gated so
  // re-expanding by tap doesn't snap back closed on the next save tick,
  // and respects an explicit "expanded" state from storage so leaving and
  // returning to the page doesn't re-close a card the user deliberately
  // reopened.
  let expanded = true;
  let _autoCollapsedSignature = '';
  $: {
    if (autoCollapse && !isSingle && allDone && totalSets > 0) {
      const sig = exercises.map(e => (e.sets || []).map(s => s.completed ? '1' : '0').join('')).join('|');
      if (_autoCollapsedSignature !== sig) {
        _autoCollapsedSignature = sig;
        if (getCollapseState(date, rowKey) !== 'expanded') {
          _setExpanded(false);
        }
      }
    }
  }

  // Persisted collapse (survives page navigation). Three-state:
  //   'collapsed' → apply closed
  //   'expanded'  → apply open (explicit user intent — no auto-collapse)
  //   null        → keep default (open)
  let _initialExpandedApplied = false;
  $: if (date && rowKey && !_initialExpandedApplied) {
    _initialExpandedApplied = true;
    const state = getCollapseState(date, rowKey);
    if (state === 'collapsed') expanded = false;
    else if (state === 'expanded') expanded = true;
  }
  function _setExpanded(next) {
    expanded = next;
    setCollapsed(date, rowKey, !next);
  }
</script>

{#if isSingle}
  <ExerciseCard
    exercise={exercises[0]}
    idx={startIdx}
    {unit}
    {date}
    {workoutDone}
    {autoCollapse}
    {mediaBySet}
    prSetIndices={prFlagsByIdx[startIdx]}
    on:openMedia
    on:update={e => dispatch('update', { idx: startIdx, exercise: e.detail })}
    on:remove={() => dispatch('remove', { idx: startIdx })}
    on:menu={() => dispatch('menu', { idx: startIdx })}
    on:info={() => dispatch('info', { idx: startIdx })}
  />
{:else}
  <div class="superset-card" class:all-done={allDone} data-progress={progress}>
    {#if loadMenuFor != null && members[loadMenuFor]}
      <LoadTypeMenu
        anchor={loadMenuAnchor}
        loadType={members[loadMenuFor].loadType}
        setType={members[loadMenuFor].setType}
        distanceUnit={members[loadMenuFor].distanceUnit}
        bind:remember={rememberLoad}
        on:pickLoad={(e) => pickLoadType(e.detail)}
        on:pickSetType={(e) => pickSetType(e.detail)}
        on:pickDistanceUnit={(e) => pickDistanceUnit(e.detail)}
        on:close={() => loadMenuFor = null} />
    {/if}

    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="superset-header" on:click={() => _setExpanded(!expanded)} role="button" tabindex="0">
      <div class="ss-head-main">
        <div class="superset-badge">
          <span class="material-symbols-rounded ss-icon">link</span>
          <span class="ss-label">{$_('superset_card.superset')}</span>
          {#if roundLabel}<span class="ss-round-label" class:done={layout.current == null}>{roundLabel}</span>{/if}
        </div>
        <!-- The members by name, so two supersets don't look alike folded. -->
        <div class="ss-names">
          {#each members as mb (mb.m)}
            <span class="ss-name"><span class="ss-letter sm">{mb.letter}</span>{mb.ex.exercise_name}</span>
          {/each}
        </div>
      </div>
      <div class="ss-meta">
        <span class="ss-progress">{$_('superset_card.sets_progress', { values: { done: completedSets, total: totalSets } })}</span>
        <button class="ss-remove-btn tap" on:click|stopPropagation={() => dispatch('removeSuperset', supersetId)}
          title={$_('superset_card.remove_superset')} aria-label={$_('superset_card.remove_superset')}>
          <span class="material-symbols-rounded">close</span>
        </button>
        <span class="material-symbols-rounded ss-chevron" class:rotated={!expanded}>expand_more</span>
      </div>
    </div>

    {#if expanded}
      <div class="superset-body" transition:slide={{ duration: 180 }}>
        <!-- The exercises: who A, B and C are, and what can be done to each. -->
        <div class="ss-members">
          {#each members as mb, i (mb.ex.uuid || mb.ex.exercise_id || i)}
            <div class="ss-member" class:done={mb.total > 0 && mb.done === mb.total}>
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="ss-member-head" on:contextmenu|preventDefault={() => dispatch('menu', { idx: startIdx + i })}>
                <span class="ss-letter">{mb.letter}</span>
                <div class="ss-member-info">
                  <div class="ss-member-name-row">
                    <span class="ss-member-name">{mb.ex.exercise_name}</span>
                    <button class="load-chip tap" class:non-default={mb.loadType !== 'bilateral' || mb.notReps}
                      on:click|stopPropagation={(e) => toggleLoadMenu(e, i)} title={$_('exercise_card.load_type')}>
                      {#if mb.loadType === 'paired'}<span class="material-symbols-rounded">compare_arrows</span>{loadLabel(mb.loadType)}
                      {:else if mb.loadType === 'unilateral'}<span class="material-symbols-rounded">swap_horiz</span>{loadLabel(mb.loadType)}
                      {:else if !mb.notReps}<span class="material-symbols-rounded">straighten</span>{/if}
                      {#if mb.notReps}<span class="material-symbols-rounded">{SET_TYPE_ICON[mb.setType]}</span>{$_(`exercise_card.set_type_${mb.setType}`)}{/if}
                    </button>
                  </div>
                </div>
                <div class="ss-member-actions">
                  {#if i > 0}
                    <button class="btn-icon-sm tap" on:click={() => dispatch('moveWithinSuperset', { supersetId, fromIdx: i, toIdx: i - 1 })}
                      title={$_('superset_card.move_up')} aria-label={$_('superset_card.move_up')}>
                      <span class="material-symbols-rounded">keyboard_double_arrow_up</span>
                    </button>
                  {/if}
                  {#if i < members.length - 1}
                    <button class="btn-icon-sm tap" on:click={() => dispatch('moveWithinSuperset', { supersetId, fromIdx: i, toIdx: i + 1 })}
                      title={$_('superset_card.move_down')} aria-label={$_('superset_card.move_down')}>
                      <span class="material-symbols-rounded">keyboard_double_arrow_down</span>
                    </button>
                  {/if}
                  <button class="btn-icon-sm tap" on:click={() => dispatch('info', { idx: startIdx + i })}
                    title={$_('superset_card.details')} aria-label={$_('superset_card.details')}>
                    <span class="material-symbols-rounded">info</span>
                  </button>
                  <button class="btn-icon-sm tap" on:click={() => dispatch('menu', { idx: startIdx + i })}
                    title={$_('superset_card.more')} aria-label={$_('superset_card.more')}>
                    <span class="material-symbols-rounded">more_vert</span>
                  </button>
                  <button class="btn-icon tap" on:click={() => dispatch('remove', { idx: startIdx + i })}
                    title={$_('superset_card.remove_exercise')} aria-label={$_('superset_card.remove_exercise')}>
                    <span class="material-symbols-rounded">close</span>
                  </button>
                </div>
              </div>

              {#if hasTargets(mb)}
                <div class="ss-member-targets">
                  {#if mb.ex.target_weight}<span class="target-chip">Target: {mb.ex.target_weight}</span>{/if}
                  {#if !mb.notReps && mb.ex.target_reps}<span class="target-chip">{mb.ex.target_reps} reps</span>{/if}
                  {#if mb.setType === 'time' && mb.ex.target_duration}<span class="target-chip">{fmtSetDuration(parseDuration(mb.ex.target_duration)) || mb.ex.target_duration}</span>{/if}
                  {#if mb.setType === 'distance' && mb.ex.target_distance}<span class="target-chip">{mb.ex.target_distance} {mb.distanceUnit}</span>{/if}
                  {#if mb.setType === 'calories' && mb.ex.target_calories}<span class="target-chip">{mb.ex.target_calories} cal</span>{/if}
                  {#if mb.progression}
                    <span class="progression-chip" title="Last session hit target reps — try going up">
                      <span class="material-symbols-rounded">trending_up</span>
                      Try {mb.progression.weight} ({unit === 'kg' ? '+2.5' : '+5'})
                    </span>
                  {/if}
                  {#if mb.volumePct !== null && mb.volumePct !== 0}
                    <span class="vol-delta" class:up={mb.volumePct > 0} class:down={mb.volumePct < 0}
                      title={mb.volumePartial ? 'Volume vs the same sets last session' : 'Volume vs last session'}>
                      {mb.volumePct > 0 ? '+' : ''}{mb.volumePct}%
                    </span>
                  {/if}
                  {#if mb.canWarmUp}
                    <button class="warmup-chip tap" on:click={() => addWarmups(i)} title="Add warm-up progression based on working weight">
                      <span class="material-symbols-rounded">bolt</span>
                      {$_('superset_card.warmups')}
                    </button>
                  {/if}
                  {#if mb.ex.notes}<span class="target-note">{mb.ex.notes}</span>{/if}
                </div>
              {/if}

              <!-- Coach feedback for THIS member, matched by the exercise's
                   uuid, falling back to its position for notes written
                   before notes carried one. -->
              {#each (feedback || []).filter(f => (f.exercise_uuid ? f.exercise_uuid === mb.ex.uuid : f.exercise_idx === startIdx + i)) as f (f.id)}
                <div class="ss-ex-feedback" in:fade={{ duration: 180 }}>
                  <div class="avatar-chip coach sm">
                    {#if f.trainer_avatar_url}
                      <img src={resolveAssetUrl(f.trainer_avatar_url)} alt="" />
                    {:else}
                      {(f.trainer_name || 'C')[0].toUpperCase()}
                    {/if}
                  </div>
                  <div class="ss-ex-feedback-body">
                    <span class="ss-ex-feedback-text">
                      <strong>{f.trainer_name || 'Coach'}:</strong> {f.note}
                    </span>
                    {#if f.updated_at}
                      <span class="ex-feedback-time">{relTime(f.updated_at)}</span>
                    {/if}
                    {#if replyOpenId === f.id}
                      <div class="reply-edit">
                        <textarea class="reply-input" rows="2"
                          use:autofocus
                          bind:value={replyDrafts[f.id]}
                          placeholder="Reply to your coach…"></textarea>
                        <div class="reply-actions">
                          {#if f.member_reply}
                            <button class="reply-link danger" on:click={() => onDeleteReply(f.id)}>{$_('superset_card.delete')}</button>
                          {/if}
                          <button class="reply-link" on:click={onCancelReply}>{$_('superset_card.cancel')}</button>
                          <button class="reply-save" class:flashed={replySavedFlash === f.id}
                                  on:click={() => onSaveReply(f.id)}
                                  disabled={replySaving === f.id || !(replyDrafts[f.id] || '').trim()}>
                            {#if replySavedFlash === f.id}<span class="material-symbols-rounded" style="font-size:14px">check</span>{:else}{replySaving === f.id ? 'Saving…' : 'Reply'}{/if}
                          </button>
                        </div>
                      </div>
                    {:else if f.member_reply}
                      <button class="my-reply" on:click={() => onOpenReply(f)}>
                        <span class="my-reply-label">
                          You{#if f.member_replied_at}{' · '}{relTime(f.member_replied_at)}{/if}
                        </span>
                        <span class="my-reply-text">{f.member_reply}</span>
                        <span class="material-symbols-rounded my-reply-edit-icon">edit</span>
                      </button>
                    {:else}
                      <button class="reply-add" on:click={() => onOpenReply(f)}>
                        <span class="material-symbols-rounded" style="font-size:14px">reply</span>
                        Reply
                      </button>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/each}
        </div>

        <!-- The sets, round by round. `sets` is the container SetRow's
             phone layout asks about, as in ExerciseCard. -->
        <div class="ss-rounds">
          {#if layout.warmups.length}
            {#if warmupsDone && !reopened.has('w')}
              <button class="ss-round-summary" on:click={() => toggleRound('w')} transition:slide={{ duration: 160 }}>
                <span class="material-symbols-rounded ss-round-check">check_circle</span>
                <span class="ss-round-title">{$_('superset_card.warmups')}</span>
                <span class="ss-round-sets">{summaryOf(layout.warmups)}</span>
              </button>
            {:else}
              <div class="ss-round warmups" transition:slide={{ duration: 160 }}>
                <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                <div class="ss-round-head" class:clickable={warmupsDone} on:click={() => warmupsDone && toggleRound('w')}>
                  <span class="ss-round-title">{$_('superset_card.warmups')}</span>
                  {#if warmupsDone}<span class="material-symbols-rounded ss-round-fold">expand_less</span>{/if}
                </div>
                {#each layout.warmups as e (`${e.member}:${e.setIdx}`)}
                  <div class="ss-entry">
                    <div class="ss-entry-caption">
                      <span class="ss-letter sm">{memberLetter(e.member)}</span>
                      <span class="ss-entry-name">{exercises[e.member].exercise_name}</span>
                    </div>
                    <SetRow
                      set={e.set}
                      setNum={0}
                      showAsWarmup={true}
                      {unit}
                      loadType={members[e.member].loadType}
                      setType={members[e.member].setType}
                      distanceUnit={members[e.member].distanceUnit}
                      media={mediaBySet?.get(e.set.uuid) || null}
                      on:openMedia
                      holdRunning={holdMatches($holdTimer, { date, exIdx: startIdx + e.member, exercise: exercises[e.member], setIdx: e.setIdx })}
                      on:startHold={() => startHoldFor(e.member, e.setIdx)}
                      on:stopHold={() => stopHold()}
                      on:update={ev => updateSet(e.member, e.setIdx, ev.detail)}
                      on:remove={() => removeSet(e.member, e.setIdx)}
                    />
                  </div>
                {/each}
              </div>
            {/if}
          {/if}

          {#each layout.rounds as round (round.number)}
            {#if round.done && !reopened.has(round.number)}
              <button class="ss-round-summary" on:click={() => toggleRound(round.number)} transition:slide={{ duration: 160 }}>
                <span class="material-symbols-rounded ss-round-check">check_circle</span>
                <span class="ss-round-title">{$_('superset_card.round', { values: { n: round.number } })}</span>
                <span class="ss-round-sets">{summaryOf(round.entries)}</span>
              </button>
            {:else}
              <div class="ss-round" class:current={round.number === layout.current} transition:slide={{ duration: 160 }}>
                <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                <div class="ss-round-head" class:clickable={round.done} on:click={() => round.done && toggleRound(round.number)}>
                  <span class="ss-round-title">{$_('superset_card.round', { values: { n: round.number } })}</span>
                  {#if round.done}<span class="material-symbols-rounded ss-round-fold">expand_less</span>{/if}
                </div>
                {#each round.entries as e (`${e.member}:${e.setIdx}`)}
                  <div class="ss-entry">
                    <div class="ss-entry-caption">
                      <span class="ss-letter sm">{memberLetter(e.member)}</span>
                      <span class="ss-entry-name">{exercises[e.member].exercise_name}</span>
                      {#if lastFor(members[e.member], round.number)}
                        <span class="ss-entry-last">{$_('superset_card.last', { values: { set: lastFor(members[e.member], round.number) } })}</span>
                      {/if}
                    </div>
                    <SetRow
                      set={e.set}
                      setNum={round.number}
                      isNext={layout.next?.member === e.member && layout.next?.setIdx === e.setIdx}
                      isPR={prFlagsByIdx[startIdx + e.member]?.has(e.setIdx)}
                      {unit}
                      loadType={members[e.member].loadType}
                      setType={members[e.member].setType}
                      distanceUnit={members[e.member].distanceUnit}
                      media={mediaBySet?.get(e.set.uuid) || null}
                      on:openMedia
                      holdRunning={holdMatches($holdTimer, { date, exIdx: startIdx + e.member, exercise: exercises[e.member], setIdx: e.setIdx })}
                      on:startHold={() => startHoldFor(e.member, e.setIdx)}
                      on:stopHold={() => stopHold()}
                      on:update={ev => updateSet(e.member, e.setIdx, ev.detail)}
                      on:remove={() => removeSet(e.member, e.setIdx)}
                    />
                  </div>
                {/each}
              </div>
            {/if}
          {/each}
        </div>

        <div class="ss-add-actions">
          <button class="ss-add-round tap" on:click={addRound}>
            <span class="material-symbols-rounded">add</span>
            {$_('superset_card.add_round')}
          </button>
          <button class="ss-add-exercise tap" on:click={() => dispatch('addToSuperset', supersetId)}>
            <span class="material-symbols-rounded">playlist_add</span>
            {$_('superset_card.add_exercise')}
          </button>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .superset-card {
    /* 1px, not 2px — every px here comes straight out of each member's
       SetRow grid on a phone (see .ss-connector / .ss-exercise-content
       below + issue #75). The frame is still visible against
       var(--bg); it doesn't need the extra px to read as a border. */
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    overflow: hidden;
    background: var(--bg);
    transition: border-color var(--dur-fast), box-shadow var(--dur-fast);
  }
  .superset-card[data-progress='partial'] {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent-dim);
  }
  .superset-card.all-done { border-color: var(--success); box-shadow: 0 0 0 1px color-mix(in srgb, var(--success) 20%, transparent); }

  .superset-header {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 10px 14px; width: 100%;
    background: linear-gradient(135deg, var(--accent-dim), transparent);
    border: none; border-bottom: 1px solid var(--border);
    color: inherit; font-family: inherit; cursor: pointer;
    transition: background var(--dur-fast);
  }
  .superset-header:hover { background: linear-gradient(135deg, var(--accent-dim), var(--surface-2)); }
  .superset-badge { display: flex; align-items: center; gap: 6px; }
  .ss-icon { font-size: 16px; color: var(--accent); }
  .ss-label { font-size: 12px; font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 0.06em; }

  .ss-meta { display: flex; align-items: center; gap: 8px; }
  .ss-progress { font-size: 12px; color: var(--text-3); }
  .ss-chevron {
    color: var(--text-3); font-size: 20px;
    transition: transform 0.2s ease;
  }
  .ss-chevron.rotated { transform: rotate(-90deg); }
  .ss-remove-btn {
    background: none; border: none; cursor: pointer;
    color: var(--text-3); padding: 2px;
    border-radius: var(--radius-xs);
    display: flex; align-items: center;
    transition: color var(--dur-fast);
  }
  .ss-remove-btn:hover { color: var(--danger); }
  .ss-remove-btn .material-symbols-rounded { font-size: 18px; }

  /* Per-exercise coach feedback within a superset — sits right under the
     specific exercise's card so the reader doesn't have to look at the
     bottom of the whole block and figure out which member it's for. */
  .ss-ex-feedback {
    display: flex; align-items: flex-start; gap: 6px;
    margin: 6px 0 4px;
    padding: 8px 10px;
    background: color-mix(in srgb, var(--accent) 8%, transparent);
    border-left: 3px solid var(--accent);
    border-radius: var(--radius-sm);
  }
  .ss-ex-feedback-text {
    flex: 1; min-width: 0;
    font-size: 13px; color: var(--text-1); line-height: 1.4;
    white-space: pre-wrap;
  }
  .ss-ex-feedback-text strong { color: var(--accent); font-weight: 700; margin-right: 2px; }
  .ss-ex-feedback-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  /* Reply controls re-use the global classes defined in Diary.svelte so
     styles stay consistent without re-declaring them here. */


  .ss-head-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
  .ss-round-label {
    font-size: 11px; font-weight: 700; color: var(--text-2);
    padding: 1px 8px; border-radius: var(--radius-full); background: var(--surface-2);
    font-variant-numeric: tabular-nums;
  }
  .ss-round-label.done { color: var(--success); }
  /* Folded, the names are what tells one superset from another. */
  .ss-names { display: flex; flex-wrap: wrap; gap: 2px 10px; min-width: 0; }
  .ss-name {
    display: inline-flex; align-items: center; gap: 4px; min-width: 0; max-width: 100%;
    font-size: 13px; font-weight: 600; color: var(--text-1);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .ss-meta { flex-shrink: 0; }

  .ss-letter {
    display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
    width: 22px; height: 22px; border-radius: var(--radius-sm);
    background: var(--accent-dim); color: var(--accent);
    font-size: 12px; font-weight: 800;
  }
  .ss-letter.sm { width: 16px; height: 16px; font-size: 10px; border-radius: 4px; }

  /* ── The exercises ─────────────────────────────────────────────── */
  .ss-members { display: flex; flex-direction: column; border-bottom: 1px solid var(--border); }
  .ss-member { padding: 8px 10px 8px 12px; }
  .ss-member + .ss-member { border-top: 1px solid var(--border); }
  .ss-member-head { display: flex; align-items: center; gap: 8px; }
  .ss-member.done .ss-letter { background: color-mix(in srgb, var(--success) 18%, transparent); color: var(--success); }
  .ss-member-info { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
  .ss-member-name-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
  .ss-member-name {
    font-size: 14px; font-weight: 700; color: var(--text-1); line-height: 1.3;
    display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden; overflow-wrap: anywhere;
  }
  .ss-member-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
  .ss-member-targets { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 0 0 30px; }

  .load-chip {
    display: inline-flex; align-items: center; gap: 3px;
    background: none; border: 1px dashed var(--border);
    color: var(--text-3); cursor: pointer; font-family: inherit;
    font-size: 10px; font-weight: 700; letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 2px 7px; border-radius: var(--radius-full);
    flex-shrink: 0;
  }
  .load-chip:hover { color: var(--text-1); border-color: var(--text-2); }
  .load-chip .material-symbols-rounded { font-size: 12px; }
  .load-chip.non-default { background: var(--accent-dim); border: 1px solid var(--accent); color: var(--accent); }

  .btn-icon-sm {
    width: 28px; height: 28px; padding: 0;
    background: none; border: none; cursor: pointer;
    color: var(--text-3); display: flex; align-items: center; justify-content: center;
    border-radius: var(--radius-sm);
  }
  .btn-icon-sm, .ss-member-actions .btn-icon { --tap-w: calc(100% + 2px); }
  .btn-icon-sm:hover { color: var(--accent); background: var(--surface-2); }
  .btn-icon-sm .material-symbols-rounded { font-size: 20px; }
  .btn-icon {
    background: none; border: none; cursor: pointer; color: var(--text-3);
    padding: 4px; border-radius: var(--radius-sm);
    display: flex; align-items: center;
  }
  .btn-icon:hover { color: var(--danger); }

  .target-chip {
    font-size: 11px; padding: 3px 8px;
    background: var(--surface-2); border-radius: var(--radius-full);
    color: var(--text-2);
  }
  .target-note { flex-basis: 100%; font-size: 12px; color: var(--text-3); font-style: italic; }
  .progression-chip {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 11px; font-weight: 700; color: var(--accent);
    background: var(--accent-dim);
    padding: 3px 9px; border-radius: var(--radius-full);
    border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  }
  .progression-chip .material-symbols-rounded { font-size: 12px; }
  .vol-delta {
    font-size: 10px; font-weight: 700;
    padding: 2px 7px; border-radius: var(--radius-full);
    background: var(--surface-2);
    font-variant-numeric: tabular-nums;
  }
  .vol-delta.up { background: color-mix(in srgb, var(--success) 16%, transparent); color: var(--success); }
  .vol-delta.down { background: color-mix(in srgb, var(--danger) 14%, transparent); color: var(--danger); }
  .warmup-chip {
    display: inline-flex; align-items: center; gap: 3px;
    font-family: inherit; font-size: 11px; font-weight: 600; cursor: pointer;
    padding: 3px 9px; border-radius: var(--radius-full);
    background: var(--surface-2); color: var(--text-2); border: 1px dashed var(--border);
  }
  .warmup-chip:hover { background: var(--accent-dim); color: var(--accent); border-color: var(--accent); }
  .warmup-chip .material-symbols-rounded { font-size: 14px; }

  /* ── The rounds ────────────────────────────────────────────────── */
  /* `sets` is the container SetRow's phone layout asks about. */
  .ss-rounds { display: flex; flex-direction: column; gap: 6px; padding: 8px 10px 4px 12px; container: sets / inline-size; }
  .ss-round {
    padding: 6px 0 8px; border-radius: var(--radius-md);
  }
  .ss-round.current {
    margin: 0 -6px; padding: 6px 6px 8px;
    background: color-mix(in srgb, var(--accent) 6%, transparent);
    box-shadow: inset 0 0 0 1px var(--accent-dim);
  }
  .ss-round-head { display: flex; align-items: center; justify-content: space-between; padding: 0 2px 2px; }
  .ss-round-head.clickable { cursor: pointer; }
  .ss-round-title {
    font-size: 11px; font-weight: 700; color: var(--text-3);
    text-transform: uppercase; letter-spacing: 0.06em; flex-shrink: 0;
  }
  .ss-round.current .ss-round-title { color: var(--accent); }
  .ss-round-fold { font-size: 18px; color: var(--text-3); }

  /* A done round, folded: one line of what was lifted. */
  .ss-round-summary {
    display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0;
    padding: 8px 10px; border-radius: var(--radius-md);
    background: var(--surface-1); border: 1px solid var(--border);
    color: var(--text-2); font-family: inherit; text-align: left; cursor: pointer;
  }
  .ss-round-summary:hover { border-color: var(--success); }
  .ss-round-check { font-size: 16px; color: var(--success); flex-shrink: 0; }
  .ss-round-sets {
    flex: 1; min-width: 0; font-size: 12px; color: var(--text-2);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    font-variant-numeric: tabular-nums;
  }

  .ss-entry + .ss-entry { margin-top: 4px; }
  .ss-entry-caption {
    display: flex; align-items: center; gap: 6px; min-width: 0;
    padding: 4px 2px 2px;
  }
  .ss-entry-name {
    flex: 1; min-width: 0; font-size: 12px; font-weight: 600; color: var(--text-2);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .ss-entry-last { flex-shrink: 0; font-size: 11px; color: var(--text-3); font-variant-numeric: tabular-nums; }
  /* The row's PR badge sits on its top edge, where the caption ends. */
  .ss-entry:has(:global(.set-row.pr)) .ss-entry-last { margin-right: 56px; }

  .ss-add-actions { display: flex; gap: 6px; padding: 6px 10px 10px 12px; }
  .ss-add-round, .ss-add-exercise {
    flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
    padding: 10px; border-radius: var(--radius-md);
    font-family: inherit; font-size: 13px; font-weight: 600;
    cursor: pointer; transition: all var(--dur-fast);
  }
  .ss-add-round {
    background: var(--surface-2); border: 1px solid var(--border); color: var(--text-2);
  }
  .ss-add-round:hover { background: var(--accent-dim); color: var(--accent); border-color: var(--accent); }
  .ss-add-exercise {
    background: var(--surface-2); border: 1px dashed var(--accent-dim); color: var(--accent);
  }
  .ss-add-exercise:hover { background: var(--accent-dim); border-color: var(--accent); }
  .ss-add-round .material-symbols-rounded, .ss-add-exercise .material-symbols-rounded { font-size: 18px; }
</style>
