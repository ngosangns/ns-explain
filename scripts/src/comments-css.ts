/** Injected into the page when the packed runtime boots (see comments.ts). */
export const COMMENTS_CSS = String.raw`
  .nsx-c-icon, .nsx-c-composer { position: absolute; z-index: 70; }
  .nsx-c-icon {
    display: none; align-items: center; justify-content: center;
    inline-size: 28px; block-size: 28px; padding: 0; cursor: pointer;
    color: var(--color-primary-content, #fff);
    background: var(--color-primary, #4f46e5);
    border: 0; border-radius: 9999px;
    box-shadow: 0 2px 8px rgb(0 0 0 / .28);
    transition: transform .12s cubic-bezier(0.23, 1, 0.32, 1);
  }
  .nsx-c-icon:hover { transform: scale(1.08); }
  .nsx-c-icon:active { transform: scale(.94); }
  .nsx-c-icon:focus-visible { outline: 2px solid var(--color-primary, #4f46e5); outline-offset: 2px; }
  .nsx-c-badge {
    position: absolute; inset-block-start: -5px; inset-inline-end: -5px;
    min-inline-size: 15px; padding-inline: 3px; border-radius: 9999px;
    font-size: 10px; font-weight: 700; line-height: 15px; text-align: center;
    color: var(--color-base-100, #fff); background: var(--color-error, #dc2626);
  }
  .nsx-c-badge:empty { display: none; }
  .nsx-c-sel { z-index: 71; }

  /* A block that already carries a comment keeps a quiet marker. */
  .nsx-c-has { box-shadow: -3px 0 0 0 var(--color-primary, #4f46e5); border-radius: 2px; }
  /* The popover keeps its own drop shadow; a code line puts the bar on its gutter, which paints over the line. */
  #ref-popover.nsx-c-has { box-shadow: 0 4px 16px rgb(0 0 0 / .25), -3px 0 0 0 var(--color-primary, #4f46e5); }
  dialog.file-dialog .code-line.nsx-c-has { box-shadow: none; background: color-mix(in oklch, var(--color-primary, #4f46e5) 10%, transparent); }
  dialog.file-dialog .code-line.nsx-c-has .ln { box-shadow: inset 3px 0 0 var(--color-primary, #4f46e5); }
  /* A dot after the thing that opens a commented popover (feature row, underlined word, diagram element). */
  .nsx-c-dot::after {
    content: ""; display: inline-block; inline-size: .45em; block-size: .45em; margin-inline-start: .25em;
    border-radius: 9999px; vertical-align: super; background: var(--color-primary, #4f46e5);
  }

  .nsx-c-composer {
    display: none; inline-size: min(22rem, calc(100vw - 16px));
    padding: .75rem; border-radius: .6rem; font-size: .875rem;
    color: var(--color-base-content, #111); background: var(--color-base-100, #fff);
    border: 1px solid var(--color-base-300, #ddd);
    box-shadow: 0 8px 28px rgb(0 0 0 / .3);
  }
  .nsx-c-head { display: flex; align-items: start; gap: .5rem; margin-block-end: .5rem; }
  .nsx-c-where { flex: 1 1 auto; min-inline-size: 0; font-weight: 600; opacity: .8; overflow-wrap: anywhere; }
  .nsx-c-x {
    appearance: none; border: 0; background: none; cursor: pointer; color: inherit;
    opacity: .6; padding: 0 .25rem; line-height: 1;
  }
  .nsx-c-x:hover { opacity: 1; }
  .nsx-c-quote {
    margin: 0 0 .5rem; padding: .35rem .5rem; border-inline-start: 3px solid var(--color-primary, #4f46e5);
    background: var(--color-base-200, #eee); border-radius: .25rem; font-size: .8rem;
    max-block-size: 6rem; overflow: auto; overflow-wrap: anywhere;
  }
  .nsx-c-kicker { font-size: .7rem; font-weight: 600; opacity: .65; margin-block-end: .1rem; }
  .nsx-c-list { list-style: none; margin: 0 0 .5rem; padding: 0; display: grid; gap: .4rem; }
  .nsx-c-item { padding: .4rem .5rem; border-radius: .35rem; background: var(--color-base-200, #eee); }
  .nsx-c-item.is-editing { outline: 2px solid var(--color-primary, #4f46e5); }
  .nsx-c-itemquote {
    font-size: .75rem; opacity: .7; margin-block-end: .15rem; overflow-wrap: anywhere;
    border-inline-start: 2px solid var(--color-base-300, #ccc); padding-inline-start: .4rem;
  }
  .nsx-c-text { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.5; }
  .nsx-c-itemactions { display: flex; gap: .75rem; margin-block-start: .25rem; }
  .nsx-c-link {
    appearance: none; border: 0; background: none; padding: 0; cursor: pointer;
    font-size: .75rem; color: var(--color-primary, #4f46e5); text-decoration: underline;
  }
  .nsx-c-danger { color: var(--color-error, #dc2626); }
  .nsx-c-input {
    inline-size: 100%; resize: vertical; min-block-size: 4.5rem; padding: .5rem;
    font: inherit; color: inherit; background: var(--color-base-100, #fff);
    border: 1px solid var(--color-base-300, #ccc); border-radius: .35rem;
  }
  .nsx-c-input:focus { outline: 2px solid var(--color-primary, #4f46e5); outline-offset: -1px; }
  .nsx-c-foot { display: flex; align-items: center; gap: .5rem; margin-block-start: .5rem; }
  .nsx-c-hint { flex: 1 1 auto; font-size: .72rem; opacity: .55; }
  .nsx-c-btn {
    appearance: none; cursor: pointer; font: inherit; font-size: .8rem;
    padding: .3rem .75rem; border-radius: .35rem; color: inherit;
    background: transparent; border: 1px solid var(--color-base-300, #ccc);
  }
  .nsx-c-btn:hover { background: var(--color-base-200, #eee); }
  .nsx-c-primary {
    color: var(--color-primary-content, #fff); background: var(--color-primary, #4f46e5);
    border-color: transparent;
  }
  .nsx-c-primary:hover { background: color-mix(in oklch, var(--color-primary, #4f46e5) 88%, black); }

  .nsx-c-dock {
    position: fixed; inset-block-end: 1.25rem; inset-inline-end: 1.25rem; z-index: 65;
    display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .5rem;
    max-inline-size: calc(100vw - 2.5rem);
  }
  .nsx-c-copy, .nsx-c-listbtn {
    appearance: none; cursor: pointer; font: inherit; font-size: .85rem; font-weight: 600;
    padding: .6rem 1rem; border: 0; border-radius: 9999px;
    color: var(--color-primary-content, #fff); background: var(--color-primary, #4f46e5);
    box-shadow: 0 4px 16px rgb(0 0 0 / .3);
    transition: transform .12s cubic-bezier(0.23, 1, 0.32, 1), background .2s;
  }
  .nsx-c-listbtn {
    color: var(--color-base-content, #111); background: var(--color-base-100, #fff);
    border: 1px solid var(--color-base-300, #ccc);
  }
  .nsx-c-listbtn.is-open { background: var(--color-base-200, #eee); }
  .nsx-c-copy:hover:not(:disabled), .nsx-c-listbtn:hover { transform: translateY(-1px); }
  .nsx-c-copy:active:not(:disabled), .nsx-c-listbtn:active { transform: scale(.97); }
  .nsx-c-copy:disabled { cursor: not-allowed; opacity: .45; box-shadow: none; }
  .nsx-c-copy.is-ok { background: var(--color-success, #16a34a); }
  .nsx-c-copy.is-fail { background: var(--color-error, #dc2626); }

  .nsx-c-panel {
    display: none; position: fixed; inset-block-end: 4.25rem; inset-inline-end: 1.25rem; z-index: 66;
    flex-direction: column; overflow: hidden;
    inline-size: min(26rem, calc(100vw - 2.5rem)); max-block-size: min(70vh, 34rem);
    font-size: .875rem; border-radius: .6rem;
    color: var(--color-base-content, #111); background: var(--color-base-100, #fff);
    border: 1px solid var(--color-base-300, #ddd); box-shadow: 0 8px 28px rgb(0 0 0 / .3);
  }
  .nsx-c-phead {
    display: flex; align-items: center; gap: .75rem; padding: .6rem .75rem;
    border-block-end: 1px solid var(--color-base-300, #ddd);
  }
  .nsx-c-ptitle { flex: 1 1 auto; font-weight: 600; }
  .nsx-c-pbody { overflow-y: auto; padding: .5rem; display: grid; gap: .4rem; }
  .nsx-c-pitem { padding: .5rem .6rem; border-radius: .4rem; background: var(--color-base-200, #eee); }
  .nsx-c-pitem.is-editing { outline: 2px solid var(--color-primary, #4f46e5); }
  .nsx-c-psection { margin-block-start: .5rem; font-size: .7rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; opacity: .65; }
  .nsx-c-pwhere { font-size: .8rem; font-weight: 600; overflow-wrap: anywhere; }
  .nsx-c-pexcerpt { margin-block: .1rem .3rem; font-size: .75rem; opacity: .6; overflow-wrap: anywhere; }
  .nsx-c-pempty { padding: .75rem; font-size: .8rem; opacity: .7; }
  .nsx-c-pedit { margin-block-start: .35rem; }
  .nsx-c-link:disabled { opacity: .4; cursor: not-allowed; text-decoration: none; }

  /* Jump target: tint fades out into the block's own background (no end keyframe on purpose). */
  .nsx-c-flash { animation: nsx-c-flash 1.5s ease-out; }
  @keyframes nsx-c-flash {
    from { background-color: color-mix(in oklch, var(--color-primary, #4f46e5) 35%, transparent); }
  }

  @media (prefers-reduced-motion: reduce) {
    .nsx-c-icon, .nsx-c-copy, .nsx-c-listbtn { transition: none; }
    .nsx-c-flash { animation: none; outline: 2px solid var(--color-primary, #4f46e5); }
  }
  @media print { .nsx-c-ui, .nsx-c-dock, .nsx-c-panel { display: none !important; } .nsx-c-has { box-shadow: none; } }
`;
