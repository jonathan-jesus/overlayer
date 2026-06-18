export interface Shadow {
  color: string;
  opacity: number;
  distance: number;
  angle: number;
  blur: number;
}

interface BaseElement {
  id: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  shadow: Shadow;
  visible: boolean;
}

export interface TextElement extends BaseElement {
  kind: 'text';
  text: string;
  fontSize: number;
  font: string;
  fill: string;
}

export interface RectElement extends BaseElement {
  kind: 'rect';
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeAlign: 'inside' | 'center' | 'outside';
  width: number;
  height: number;
}

export interface ImageElement extends BaseElement {
  kind: 'image';
  src: string;
  width: number;
  height: number;
}

export type CanvasElement = TextElement | RectElement | ImageElement;

export type ElementPatch<T> = T extends unknown ? Partial<Omit<T, 'id' | 'kind'>> : never;
export type CanvasElementPatch = ElementPatch<CanvasElement>;

export type CanvasAction =
  | { type: 'ADD_TEXT'; x?: number; y?: number }
  | { type: 'ADD_RECT'; x?: number; y?: number }
  | { type: 'ADD_IMAGE'; src: string; width: number; height: number; x?: number; y?: number }
  | { type: 'REORDER_ELEMENTS'; fromIndex: number; toIndex: number }
  | { type: 'UPDATE_ELEMENT'; id: string; patch: CanvasElementPatch }
  | { type: 'MOVE_ELEMENT'; id: string; x: number; y: number }
  | { type: 'DELETE_ELEMENT'; id: string };

const DEFAULT_SHADOW: Shadow = {
  color: '#000000',
  opacity: 100,
  distance: 0,
  angle: 135,
  blur: 0,
};

const BASE_DEFAULTS = {
  x: 50,
  y: 50,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 100,
  shadow: DEFAULT_SHADOW,
  visible: true,
};

const DEFAULT_TEXT: Omit<TextElement, 'id'> = {
  ...BASE_DEFAULTS,
  kind: 'text',
  text: 'Text',
  fontSize: 32,
  font: 'Inter',
  fill: '#ffffff',
};

const DEFAULT_RECT: Omit<RectElement, 'id'> = {
  ...BASE_DEFAULTS,
  kind: 'rect',
  fill: '#6366f1',
  stroke: '#ffffff',
  strokeWidth: 0,
  strokeAlign: 'center',
  width: 200,
  height: 100,
};

export function canvasReducer(state: CanvasElement[], action: CanvasAction): CanvasElement[] {
  switch (action.type) {
    case 'ADD_TEXT':
      return [...state, { id: crypto.randomUUID(), ...DEFAULT_TEXT, x: action.x ?? DEFAULT_TEXT.x, y: action.y ?? DEFAULT_TEXT.y }];

    case 'ADD_RECT':
      return [...state, { id: crypto.randomUUID(), ...DEFAULT_RECT, x: action.x ?? DEFAULT_RECT.x, y: action.y ?? DEFAULT_RECT.y }];

    case 'ADD_IMAGE':
      return [
        ...state,
        {
          id: crypto.randomUUID(),
          ...BASE_DEFAULTS,
          kind: 'image',
          src: action.src,
          width: action.width,
          height: action.height,
          x: action.x ?? BASE_DEFAULTS.x,
          y: action.y ?? BASE_DEFAULTS.y,
        },
      ];

    case 'REORDER_ELEMENTS': {
      const next = [...state];
      const [moved] = next.splice(action.fromIndex, 1);
      next.splice(action.toIndex, 0, moved);
      return next;
    }

    case 'UPDATE_ELEMENT':
      return state.map((el) =>
        el.id === action.id ? { ...el, ...action.patch } : el
      );

    case 'MOVE_ELEMENT':
      return state.map((el) =>
        el.id === action.id ? { ...el, x: action.x, y: action.y } : el
      );

    case 'DELETE_ELEMENT':
      return state.filter((el) => el.id !== action.id);
  }
}
