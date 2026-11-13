(function () {
  "use strict";

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function attach(canvas, chart, options) {
    const config = options || {};
    const total = (chart.data.labels || []).length;
    if (total < 2) {
      return { reset() {}, destroy() {} };
    }

    const minSpan = Math.max(1, Math.min(config.minSpan || 8, total - 1));
    const root = config.root || document;
    const slider = root.querySelector(config.sliderSelector || "[data-chart-pan-slider]");
    const label = root.querySelector(config.labelSelector || "[data-chart-zoom-label]");
    const zoomInButton = root.querySelector("[data-chart-zoom-in]");
    const zoomOutButton = root.querySelector("[data-chart-zoom-out]");
    const resetButton = root.querySelector("[data-chart-reset-zoom]");

    let start = 0;
    let end = total - 1;
    let dragging = false;
    let lastX = 0;

    function span() {
      return end - start;
    }

    function syncControls() {
      if (label) label.textContent = `${Math.max(1, Math.round(span()) + 1)} / ${total}`;
      if (slider) {
        const maxStart = Math.max(0, total - 1 - span());
        slider.max = String(maxStart);
        slider.value = String(clamp(start, 0, maxStart));
        slider.disabled = maxStart <= 0;
        slider.classList.toggle("hidden", maxStart <= 0);
      }
      if (zoomInButton) zoomInButton.disabled = span() <= minSpan;
      if (zoomOutButton) zoomOutButton.disabled = span() >= total - 1;
      if (resetButton) resetButton.disabled = span() >= total - 1;
    }

    function apply() {
      chart.options.scales.x.min = start;
      chart.options.scales.x.max = end;
      chart.update("none");
      syncControls();
    }

    function setWindow(nextStart, nextEnd) {
      const width = clamp(nextEnd - nextStart, minSpan, total - 1);
      const safeStart = clamp(nextStart, 0, total - 1 - width);
      start = safeStart;
      end = safeStart + width;
      apply();
    }

    function reset() {
      start = 0;
      end = total - 1;
      apply();
    }

    function zoomAt(value, factor) {
      const width = Math.max(span(), minSpan);
      const nextWidth = clamp(width * factor, minSpan, total - 1);
      if (Math.abs(nextWidth - width) < 0.001) return;
      const ratio = width > 0 ? (value - start) / width : 0.5;
      const nextStart = value - ratio * nextWidth;
      setWindow(nextStart, nextStart + nextWidth);
    }

    function panByPixels(delta) {
      const area = chart.chartArea;
      if (!area || area.width <= 0) return;
      const shift = (delta / area.width) * span();
      setWindow(start + shift, end + shift);
    }

    function onWheel(event) {
      if (!chart.chartArea) return;
      if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        event.preventDefault();
        panByPixels(event.deltaX || event.deltaY);
        return;
      }
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const value = chart.scales.x.getValueForPixel(event.clientX - rect.left);
      if (!Number.isFinite(value)) return;
      zoomAt(value, event.deltaY > 0 ? 1.2 : 0.8);
    }

    function onPointerDown(event) {
      if (event.button !== 0) return;
      dragging = true;
      lastX = event.clientX;
      canvas.classList.add("is-panning");
      if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event) {
      if (!dragging) return;
      const delta = event.clientX - lastX;
      if (Math.abs(delta) < 1) return;
      lastX = event.clientX;
      panByPixels(-delta);
    }

    function onPointerUp(event) {
      if (!dragging) return;
      dragging = false;
      canvas.classList.remove("is-panning");
      if (canvas.releasePointerCapture) {
        try {
          canvas.releasePointerCapture(event.pointerId);
        } catch (_) {}
      }
    }

    function onSliderInput() {
      if (!slider) return;
      const nextStart = Number(slider.value);
      setWindow(nextStart, nextStart + span());
    }

    function onZoomIn() {
      zoomAt((start + end) / 2, 0.75);
    }

    function onZoomOut() {
      zoomAt((start + end) / 2, 1.333);
    }

    function onDoubleClick() {
      reset();
    }

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("dblclick", onDoubleClick);
    if (slider) slider.addEventListener("input", onSliderInput);
    if (zoomInButton) zoomInButton.addEventListener("click", onZoomIn);
    if (zoomOutButton) zoomOutButton.addEventListener("click", onZoomOut);
    if (resetButton) resetButton.addEventListener("click", reset);

    syncControls();

    return {
      reset,
      destroy() {
        canvas.removeEventListener("wheel", onWheel);
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerup", onPointerUp);
        canvas.removeEventListener("pointercancel", onPointerUp);
        canvas.removeEventListener("dblclick", onDoubleClick);
        canvas.classList.remove("is-panning");
        if (slider) slider.removeEventListener("input", onSliderInput);
        if (zoomInButton) zoomInButton.removeEventListener("click", onZoomIn);
        if (zoomOutButton) zoomOutButton.removeEventListener("click", onZoomOut);
        if (resetButton) resetButton.removeEventListener("click", reset);
      },
    };
  }

  window.ChartZoom = { attach };
})();