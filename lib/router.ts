import { FlamethrowerOptions, RouteChangeData } from './interfaces';
import {
  addToPushState,
  handleLinkClick,
  handlePopState,
  scrollToTop,
} from './handlers';
import { mergeHead, formatNextDocument, replaceBody, runScripts } from './dom';

const defaultOpts = {
  log: false,
  prefetch: true,
  pageTransitions: false,
};

export class Router {
  public enabled = true;
  private prefetched = new Set<string>();

  constructor(public opts?: FlamethrowerOptions) {
    this.opts = { ...defaultOpts, ...opts };

    if (window?.history) {
      document.addEventListener('click', (e) => this.onClick(e));
      window.addEventListener('popstate', (e) => this.onPop(e));
    } else {
      console.warn(
        'flamethrower router not supported in this browser or environment'
      );
    }

    this.prefetch();
  }
  /**
   * @param  {string} path
   * Navigate to a url
   */
  go(path: string) {
    const prev = window.location.href;
    const next = new URL(path, location.origin).href;
    return this.reconstructDOM({ type: 'go', next, prev });
  }

  /**
   * Navigate back
   */
  back() {
    window.history.back();
  }

  /**
   * Navigate forward
   */
  forward() {
    window.history.forward();
  }

  private log(...args: any[]) {
    console.log(...args);
  }

  /**
   *  Finds links on page and prefetches them
   */
  private prefetch() {
    if (this.opts.prefetch) {
      const allLinks = Array.from(document.links)
        .map((l) => l.href)
        .filter(
          (v) =>
            v.includes(document.location.origin) && // on origin url
            !v.includes('#') && // not an id anchor
            v !== (document.location.href || document.location.href + '/') && // not current page
            !this.prefetched.has(v) // not already prefetched
        );

      allLinks.forEach((url) => {
        const linkEl = document.createElement('link');
        linkEl.rel = `prefetch`;
        linkEl.href = url;

        linkEl.onload = () => this.log('🌩️ prefetched', url);
        linkEl.onerror = (err) => this.log("🤕 can't prefetch", url, err);

        document.head.appendChild(linkEl);

        // Keep track of prefetched links
        this.prefetched.add(url);
      });
    }
  }

  /**
   * @param  {MouseEvent} e
   * Handle clicks on links
   */
  private onClick(e: MouseEvent) {
    this.reconstructDOM(handleLinkClick(e));
  }

  /**
   * @param  {PopStateEvent} e
   * Handle popstate events like back/forward
   */
  private onPop(e: PopStateEvent) {
    this.reconstructDOM(handlePopState(e));
  }
  /**
   * @param  {RouteChangeData} routeChangeData
   * Main process for reconstructing the DOM
   */
  private async reconstructDOM({ type, next, prev }: RouteChangeData) {
    if (!this.enabled) {
      this.log('router disabled');
      return;
    }

    try {
      this.log('⚡', type);

      // Check type && window href destination
      // Disqualify if fetching same URL

      if (['popstate', 'link', 'go'].includes(type) && next !== prev) {
        this.opts.log && console.time('⏱️');

        window.dispatchEvent(new CustomEvent('router:fetch'));

        // Update window history
        addToPushState(next);

        // Fetch next document
        const res = await fetch(next);
        const html = await res.text();
        const nextDoc = formatNextDocument(html);

        // Merge HEAD
        mergeHead(nextDoc);

        // Merge BODY
        // with optional native browser page transitions
        if (
          this.opts.pageTransitions &&
          (document as any).createDocumentTransition
        ) {
          const transition = (document as any).createDocumentTransition();
          transition.start(() => {
            replaceBody(nextDoc);
            runScripts();
          });
        } else {
          replaceBody(nextDoc);
          runScripts();
        }

        // handle scroll
        scrollToTop(type);

        window.dispatchEvent(new CustomEvent('router:end'));

        this.prefetch();
        this.opts.log && console.timeEnd('⏱️');
      }
    } catch (err) {
      window.dispatchEvent(new CustomEvent('router:error', err));
      this.opts.log && console.timeEnd('⏱️');
      console.error('💥 router fetch failed', err);
      return false;
    }
  }
}