/* Navigation and lazy media build on RARM's section-spy and data-src pattern. */
(() => {
  'use strict';

  function initNavigation() {
    const navigation = document.querySelector('.section-nav');
    const entries = [...document.querySelectorAll('.progress-item')].map(item => ({
      item, link: item.querySelector('a'), section: document.getElementById(item.dataset.section),
    })).filter(entry => entry.section);
    let scheduled = false;
    let stickyInset = 0;

    function sync() {
      scheduled = false;
      navigation.classList.toggle('is-stuck', window.scrollY > 0 && navigation.getBoundingClientRect().top <= stickyInset + 0.5);
      const probe = Math.max(navigation.offsetHeight + stickyInset + 32, Math.min(window.innerHeight * 0.22, 180));
      let active = 0;
      entries.forEach((entry, index) => {
        if (entry.section.getBoundingClientRect().top <= probe) active = index;
      });
      entries.forEach(({ item, link }, index) => {
        item.classList.toggle('active', index === active);
        if (index === active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }
    function queue() {
      if (!scheduled) { scheduled = true; requestAnimationFrame(sync); }
    }
    function measureNavigation() {
      stickyInset = parseFloat(getComputedStyle(navigation).top) || 0;
      document.documentElement.style.setProperty('--section-nav-height', `${navigation.offsetHeight}px`);
      queue();
    }
    // Account for wrapped links and font loading so anchor headings stay below the bar.
    if ('ResizeObserver' in window) new ResizeObserver(measureNavigation).observe(navigation);
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', measureNavigation, { passive: true });
    window.addEventListener('hashchange', queue);
    measureNavigation();
  }

  function timeLabel(seconds) {
    if (!Number.isFinite(seconds)) return '0:00';
    return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  }

  class MediaUnit {
    constructor(element) {
      this.element = element;
      this.videos = [...element.querySelectorAll('video')];
      this.paired = element.hasAttribute('data-paired');
      this.visible = false;
      this.loaded = false;
      this.userPaused = false;
      this.pending = false;
      this.syncRequest = 0;
      this.autoPauses = new WeakSet();
      this.autoPlays = new WeakSet();
      this.fallback = element.querySelector('.play-fallback');
      this.error = element.querySelector('.media-error');
      this.seek = element.querySelector('[data-seek]');
      this.toggle = element.querySelector('[data-toggle-play]');
      this.time = element.querySelector('[data-time]');

      for (const video of this.videos) {
        // RARM's autoplay markup is retained; visibility controls when play() runs.
        video.autoplay = false;
        video.muted = true;
        video.defaultMuted = true;
        video.addEventListener('play', () => {
          const automatic = this.autoPlays.delete(video);
          if (!this.eligible()) { this.pauseVideo(video); return; }
          if (!automatic) this.userPaused = false;
          this.updateControls();
        });
        video.addEventListener('pause', () => {
          if (this.autoPauses.delete(video)) { this.updateControls(); return; }
          if (!video.ended && this.eligible()) {
            this.userPaused = true;
            this.pause();
          }
          this.updateControls();
        });
        video.addEventListener('loadedmetadata', () => this.updateControls());
        video.addEventListener('canplay', () => {
          if (this.shouldPlay() && video.paused && this.fallback.hidden) this.play();
        });
        video.addEventListener('error', () => {
          this.error.hidden = false;
          this.fallback.hidden = true;
          this.pause();
        });
      }
      const lead = this.videos[0];
      lead.addEventListener('timeupdate', () => {
        this.updateControls();
      });
      if (this.paired) {
        // Both published pairs have matching durations; native looping avoids
        // synthetic pause/ended races while the sync clock aligns each restart.
        lead.addEventListener('waiting', () => {
          for (const follower of this.videos.slice(1)) this.pauseVideo(follower);
        });
        lead.addEventListener('playing', () => {
          if (!this.shouldPlay()) return;
          for (const follower of this.videos.slice(1)) {
            if (follower.readyState >= 1 && Math.abs(follower.currentTime - lead.currentTime) > 0.08) follower.currentTime = lead.currentTime;
            if (follower.paused) {
              this.autoPlays.add(follower);
              follower.play().catch(() => { this.fallback.hidden = false; });
            }
          }
          this.syncPair();
        });
      }
      this.fallback.addEventListener('click', () => { this.userPaused = false; this.play(); });
      this.toggle?.addEventListener('click', () => {
        if (lead.paused) { this.userPaused = false; this.play(); }
        else { this.userPaused = true; this.pause(); }
      });
      element.querySelector('[data-replay]')?.addEventListener('click', () => {
        this.seekTo(0); this.userPaused = false; this.play();
      });
      this.seek?.addEventListener('input', () => {
        const duration = lead.duration;
        if (Number.isFinite(duration)) this.seekTo(Number(this.seek.value) / 1000 * duration);
      });
      element.querySelector('[data-fullscreen]')?.addEventListener('click', async () => {
        try {
          if (document.fullscreenElement) await document.exitFullscreen();
          else if (element.requestFullscreen) await element.requestFullscreen();
          else if (lead.webkitEnterFullscreen) lead.webkitEnterFullscreen();
        } catch { /* Playback controls remain available if fullscreen is unavailable. */ }
      });
    }

    eligible() {
      return this.visible && !document.hidden && !this.element.closest('[hidden]');
    }
    shouldPlay() { return this.eligible() && !this.userPaused; }
    load() {
      if (this.loaded || this.element.closest('[hidden]')) return;
      this.loaded = true;
      this.element.dataset.loaded = 'true';
      for (const video of this.videos) {
        video.src = video.dataset.src;
        video.load();
      }
    }
    async play() {
      if (!this.shouldPlay() || this.pending) return;
      this.load();
      this.pending = true;
      let interrupted = false;
      try {
        await Promise.all(this.videos.map(video => {
          if (!video.paused) return Promise.resolve();
          this.autoPlays.add(video);
          return video.play();
        }));
        this.fallback.hidden = true;
        if (!this.shouldPlay()) this.pause();
        else this.syncPair();
      } catch (error) {
        interrupted = error.name === 'AbortError';
        if (this.shouldPlay() && error.name !== 'AbortError') {
          this.pause();
          this.fallback.hidden = false;
        }
      } finally {
        this.pending = false;
        this.updateControls();
        // A rapid scroll or tab change can interrupt a pending media play promise.
        // Reconcile against current visibility after that promise has settled.
        if (interrupted && this.shouldPlay()) this.play();
      }
    }
    syncPair() {
      if (!this.paired || this.syncRequest) return;
      const sync = () => {
        this.syncRequest = 0;
        const lead = this.videos[0];
        if (!this.shouldPlay() || lead.paused) return;
        for (const follower of this.videos.slice(1)) {
          if (follower.readyState >= 2 && !follower.seeking && !lead.seeking
              && Math.abs(follower.currentTime - lead.currentTime) > 0.08) {
            follower.currentTime = lead.currentTime;
          }
        }
        this.syncRequest = requestAnimationFrame(sync);
      };
      this.syncRequest = requestAnimationFrame(sync);
    }
    pauseVideo(video) {
      if (!video.paused) { this.autoPauses.add(video); video.pause(); }
    }
    pause() {
      cancelAnimationFrame(this.syncRequest);
      this.syncRequest = 0;
      this.videos.forEach(video => this.pauseVideo(video));
    }
    setVisible(visible) {
      this.visible = visible;
      this.element.dataset.visible = String(visible);
      if (this.shouldPlay()) this.play();
      else this.pause();
    }
    reset() {
      this.pause();
      this.userPaused = false;
      this.seekTo(0);
    }
    seekTo(time) {
      for (const video of this.videos) {
        if (video.readyState >= 1) video.currentTime = Math.min(time, video.duration || time);
      }
      this.updateControls();
    }
    updateControls() {
      const lead = this.videos[0];
      if (this.toggle) {
        this.toggle.textContent = lead.paused ? 'Play' : 'Pause';
        this.toggle.setAttribute('aria-label', `${lead.paused ? 'Play' : 'Pause'} comparison`);
      }
      if (this.time) this.time.textContent = `${timeLabel(lead.currentTime)} / ${timeLabel(lead.duration)}`;
      if (this.seek && Number.isFinite(lead.duration)) {
        this.seek.value = Math.round(lead.currentTime / lead.duration * 1000);
        this.seek.setAttribute('aria-valuetext', `${timeLabel(lead.currentTime)} of ${timeLabel(lead.duration)}`);
      }
    }
  }

  function initMedia() {
    const units = [...document.querySelectorAll('[data-media-unit]')].map(element => new MediaUnit(element));
    const byElement = new Map(units.map(unit => [unit.element, unit]));
    const isVisible = element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 80 && rect.top < window.innerHeight - 30;
    };
    let nearObserver;
    let visibleObserver;
    if ('IntersectionObserver' in window) {
      // RARM's 200 px preload margin; playback gets a separate, ongoing observer.
      nearObserver = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) byElement.get(entry.target).load();
      }, { rootMargin: '200px', threshold: 0.01 });
      visibleObserver = new IntersectionObserver(entries => {
        for (const entry of entries) byElement.get(entry.target).setVisible(entry.isIntersecting);
      }, { rootMargin: '-80px 0px -30px 0px', threshold: 0.01 });
      for (const unit of units) { nearObserver.observe(unit.element); visibleObserver.observe(unit.element); }
    } else {
      const refresh = () => units.forEach(unit => unit.setVisible(isVisible(unit.element)));
      window.addEventListener('scroll', refresh, { passive: true });
      window.addEventListener('resize', refresh, { passive: true });
      refresh();
    }
    document.addEventListener('visibilitychange', () => {
      for (const unit of units) {
        if (unit.shouldPlay()) unit.play();
        else unit.pause();
      }
    });

    for (const gallery of document.querySelectorAll('[data-video-tabs]')) {
      const tabs = [...gallery.querySelectorAll('[role="tab"]')];
      function select(index, focus = false) {
        const selected = tabs[index];
        if (selected.getAttribute('aria-selected') === 'true') { if (focus) selected.focus(); return; }
        tabs.forEach(tab => {
          const panel = document.getElementById(tab.getAttribute('aria-controls'));
          const unit = byElement.get(panel.querySelector('[data-media-unit]'));
          const active = tab === selected;
          if (!active) { unit.setVisible(false); panel.hidden = true; }
          tab.setAttribute('aria-selected', String(active));
          tab.tabIndex = active ? 0 : -1;
        });
        const panel = document.getElementById(selected.getAttribute('aria-controls'));
        panel.hidden = false;
        const unit = byElement.get(panel.querySelector('[data-media-unit]'));
        unit.reset();
        unit.setVisible(isVisible(unit.element));
        if (focus) selected.focus();
      }
      tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => select(index));
        tab.addEventListener('keydown', event => {
          let next;
          if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
          if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
          if (event.key === 'Home') next = 0;
          if (event.key === 'End') next = tabs.length - 1;
          if (next !== undefined) { event.preventDefault(); select(next, true); }
        });
      });
    }
  }

  function initViewer() {
    const panel = document.getElementById('asset-panel');
    let started = false;
    async function start() {
      if (started) return;
      started = true;
      try { await import('./asset-viewer.js'); }
      catch {
        const status = document.getElementById('asset-status');
        status.dataset.state = 'error';
        status.textContent = 'The 3D viewer could not load. You can still explore the asset gallery video below.';
      }
    }
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); start(); }
      }, { rootMargin: '250px' });
      observer.observe(panel);
    } else start();
  }

  function initCitation() {
    const button = document.getElementById('copy-citation');
    const status = document.getElementById('copy-status');
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(document.querySelector('#BibTeX code').textContent);
        button.textContent = 'Copied';
        status.textContent = 'Citation copied to clipboard.';
        setTimeout(() => { button.textContent = 'Copy citation'; }, 2000);
      } catch {
        status.textContent = 'Select and copy the BibTeX below.';
        button.textContent = 'Select text below';
      }
    });
  }

  initNavigation();
  initMedia();
  initViewer();
  initCitation();
})();
