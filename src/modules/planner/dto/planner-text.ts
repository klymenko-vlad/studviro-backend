export const MAX_PLANNER_TITLE = 200;
export const MAX_PLANNER_NOTE = 2000;
export const MAX_PLANNER_LOCATION = 200;

export const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const blankToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const text = value.trim();

  return text === '' ? null : text;
};
