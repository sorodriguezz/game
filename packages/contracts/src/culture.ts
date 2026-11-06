export interface CultureView {
  pointsMilli: number;
  perDay: number;
  requiredMilli: number;
  ownedVillages: number;
  pendingVillages: number;
  slots: number;
  usedSlots: number;
  pendingSlots: number;
  celebration: null | { id: string; points: number; startedAt: string; completesAt: string };
}
