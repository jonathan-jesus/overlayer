import '@testing-library/jest-dom';

global.ResizeObserver = class ResizeObserver {
  observe() { }
  unobserve() { }
  disconnect() { }
};

HTMLElement.prototype.setPointerCapture = () => { };
HTMLElement.prototype.releasePointerCapture = () => { };
