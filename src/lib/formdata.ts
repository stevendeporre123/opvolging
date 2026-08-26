// De workers-types definitie van FormData.get() is te strikt (string | null),
// terwijl de Workers-runtime ook File-objecten teruggeeft.
export function alsBestand(waarde: unknown): File | null {
  if (!waarde || typeof waarde === 'string') return null;
  return waarde as File;
}
