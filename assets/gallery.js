/* D-TECH gallery (gallery.html): category filters and a full-screen viewer.
 * Every tile is a plain link to its full-size file, so without JavaScript a
 * tap still opens the photo or video; this script upgrades that to the viewer. */
(function () {
  'use strict';

  var gridEl = document.getElementById('gl-grid');
  var dialog = document.getElementById('gl-lightbox');
  if (!gridEl || !dialog || typeof dialog.showModal !== 'function') return;

  var stage = dialog.querySelector('.gl-lb-stage');
  var holder = dialog.querySelector('.gl-lb-media');
  var caption = dialog.querySelector('.gl-lb-caption');
  var counter = dialog.querySelector('.gl-lb-count');
  var status = document.getElementById('gl-status');
  var gridTiles = Array.prototype.slice.call(gridEl.querySelectorAll('.gl-tile'));

  var set = [];      // tiles the viewer steps through
  var index = 0;
  var opener = null; // tile to return focus to
  var swiped = false; // a swipe just ended; ignore its click

  // ---- Filters ---------------------------------------------------------
  var chips = Array.prototype.slice.call(document.querySelectorAll('.gl-chip'));

  function applyFilter(cat) {
    var shown = 0;
    gridTiles.forEach(function (tile) {
      var item = tile.parentNode;
      var match = cat === 'all' || item.getAttribute('data-occasion') === cat;
      item.hidden = !match;
      if (match) shown++;
    });
    chips.forEach(function (chip) {
      chip.setAttribute('aria-pressed', chip.getAttribute('data-occasion') === cat ? 'true' : 'false');
    });
    if (status) status.textContent = 'Showing ' + shown + (shown === 1 ? ' moment' : ' moments') + '.';
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () { applyFilter(chip.getAttribute('data-occasion')); });
  });

  // ---- Viewer ----------------------------------------------------------
  function visibleGridTiles() {
    return gridTiles.filter(function (tile) { return !tile.parentNode.hidden; });
  }

  function stopMedia() {
    var video = holder.querySelector('video');
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  }

  function render() {
    var tile = set[index];
    stopMedia();
    var media;
    if (tile.getAttribute('data-type') === 'video') {
      media = document.createElement('video');
      media.controls = true;
      media.playsInline = true;
      media.preload = 'metadata';
      media.autoplay = true; // the visitor just pressed play on the tile
      media.poster = tile.querySelector('img').getAttribute('src');
      media.src = tile.getAttribute('href');
    } else {
      media = document.createElement('img');
      media.decoding = 'async';
      media.src = tile.getAttribute('href');
    }
    var text = tile.getAttribute('data-caption') || '';
    media.setAttribute('aria-label', text);
    if (media.tagName === 'IMG') media.alt = text;
    holder.replaceChildren(media);
    caption.textContent = text;
    counter.textContent = (index + 1) + ' / ' + set.length;

    // Warm the next photo so stepping through feels instant.
    var next = set[(index + 1) % set.length];
    if (next && next.getAttribute('data-type') !== 'video') {
      var warm = new Image();
      warm.src = next.getAttribute('href');
    }
  }

  function step(delta) {
    if (set.length < 2) return;
    index = (index + delta + set.length) % set.length;
    render();
  }

  function open(tile) {
    var visible = visibleGridTiles();
    var href = tile.getAttribute('href');
    var pos = visible.map(function (t) { return t.getAttribute('href'); }).indexOf(href);
    // A highlight hidden by the current filter steps through every moment.
    set = pos === -1 ? gridTiles : visible;
    index = pos === -1 ? gridTiles.map(function (t) { return t.getAttribute('href'); }).indexOf(href) : pos;
    if (index < 0) { set = [tile]; index = 0; }
    opener = tile;
    render();
    dialog.showModal();
  }

  document.addEventListener('click', function (event) {
    var tile = event.target.closest && event.target.closest('.gl-tile');
    if (!tile || event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    open(tile);
  });

  dialog.querySelector('.gl-lb-prev').addEventListener('click', function () { step(-1); });
  dialog.querySelector('.gl-lb-next').addEventListener('click', function () { step(1); });
  dialog.querySelector('.gl-lb-close').addEventListener('click', function () { dialog.close(); });

  dialog.addEventListener('keydown', function (event) {
    if (event.target.tagName === 'VIDEO') return; // arrows seek inside the player
    if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
  });

  // A click on the dark area around the photo closes the viewer (not the
  // click that ends a swipe).
  dialog.addEventListener('click', function (event) {
    if (swiped) { swiped = false; return; }
    if (event.target === dialog || event.target === stage || event.target === holder) dialog.close();
  });

  dialog.addEventListener('close', function () {
    // 'close' fires a task later; if a tile reopened the viewer since, keep it.
    if (dialog.open) return;
    stopMedia();
    holder.replaceChildren();
    if (opener && document.contains(opener)) opener.focus();
    opener = null;
  });

  // Swipe left or right on touch screens.
  var startX = null;
  stage.addEventListener('pointerdown', function (event) {
    swiped = false;
    if (event.pointerType !== 'mouse') startX = event.clientX;
  });
  stage.addEventListener('pointerup', function (event) {
    if (startX === null) return;
    var dx = event.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 50) {
      swiped = true;
      step(dx < 0 ? 1 : -1);
    }
  });
  stage.addEventListener('pointercancel', function () { startX = null; });
})();
