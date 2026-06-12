export interface TextElement {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
}

export type CanvasAction =
  | { type: 'ADD_ELEMENT' }
  | { type: 'UPDATE_ELEMENT'; id: string; patch: Partial<Omit<TextElement, 'id'>> }
  | { type: 'MOVE_ELEMENT'; id: string; x: number; y: number }
  | { type: 'DELETE_ELEMENT'; id: string };

const DEFAULT_ELEMENT: Omit<TextElement, 'id'> = {
  text: 'Text',
  x: 50,
  y: 50,
  fontSize: 32,
  color: '#ffffff',
};

export function canvasReducer(state: TextElement[], action: CanvasAction): TextElement[] {
  switch (action.type) {
    case 'ADD_ELEMENT':
      return [...state, { id: crypto.randomUUID(), ...DEFAULT_ELEMENT }];

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
