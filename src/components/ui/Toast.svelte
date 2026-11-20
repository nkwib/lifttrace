<script>
  import { fly, fade } from 'svelte/transition';
  import { toasts } from '../../stores/toast.js';
</script>

<div class="toast-container" aria-live="polite">
  {#each $toasts as toast (toast.id)}
    <div
      class="toast toast--{toast.type}"
      in:fly={{ y: 20, duration: 240 }}
      out:fade={{ duration: 160 }}
    >
      {#if toast.type === 'success'}
        <span class="material-symbols-rounded toast-icon">check_circle</span>
      {:else if toast.type === 'error'}
        <span class="material-symbols-rounded toast-icon">error</span>
      {/if}
      <span class="toast-msg">{toast.message}</span>
      {#if toast.action}
        <button type="button" class="toast-action" on:click={toast.action.onClick}>{toast.action.label}</button>
      {/if}
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    /* Above the mini player, the rest and hold bars and the workout pill
       (--wm-h, kept out of --bottom-overlays so page layouts do not shift). */
    bottom: calc(var(--nav-bar-h, var(--nav-h)) + var(--safe-bottom) + var(--bottom-overlays, 0px) + var(--wm-h, 0px) + 12px);
    transition: bottom 0.26s cubic-bezier(0.22, 1, 0.36, 1);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 8px;
    /* Above the Trace panel (450) and dialogs (600), as in NoteTrace: a
       message from Trace has to show while Trace is open on a phone. */
    z-index: 900;
    pointer-events: none;
    /* As wide as the longest message, up to the screen; longer ones wrap. */
    width: max-content;
    max-width: calc(100vw - 32px);
  }
  .toast {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 18px;
    border-radius: var(--radius-lg);
    background: var(--surface-3);
    border: 1px solid var(--border-strong);
    box-shadow: var(--shadow-lg);
    font-size: 14px;
    font-weight: 500;
    color: var(--text-1);
    overflow-wrap: anywhere;
    backdrop-filter: var(--backdrop-blur);
    -webkit-backdrop-filter: var(--backdrop-blur);
  }
  .toast--success { border-color: rgba(79,255,176,0.25); }
  .toast--error   { border-color: rgba(255,92,92,0.25); }
  .toast-icon { font-size: 18px; flex-shrink: 0; }
  .toast--success .toast-icon { color: var(--success); }
  .toast--error   .toast-icon { color: var(--danger); }
  .toast-msg { flex: 1; }
  .toast-action {
    pointer-events: auto;
    min-height: 44px;
    min-width: 44px;
    margin: -12px -10px -12px 0;
    padding: 0 12px;
    background: none;
    border: none;
    color: var(--accent);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
</style>
