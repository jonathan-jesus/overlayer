export interface Shadow {
  color: string;
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
  | { type: 'ADD_TEXT' }
  | { type: 'ADD_RECT' }
  | { type: 'ADD_IMAGE'; src: string; width: number; height: number }
  | { type: 'REORDER_ELEMENTS'; fromIndex: number; toIndex: number }
  | { type: 'UPDATE_ELEMENT'; id: string; patch: CanvasElementPatch }
  | { type: 'MOVE_ELEMENT'; id: string; x: number; y: number }
  | { type: 'DELETE_ELEMENT'; id: string };

const DEFAULT_SHADOW: Shadow = {
  color: '#000000',
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
  width: 200,
  height: 100,
};

export function canvasReducer(state: CanvasElement[], action: CanvasAction): CanvasElement[] {
  switch (action.type) {
    case 'ADD_TEXT':
      return [...state, { id: crypto.randomUUID(), ...DEFAULT_TEXT }];

    case 'ADD_RECT':
      return [...state, { id: crypto.randomUUID(), ...DEFAULT_RECT }];

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
