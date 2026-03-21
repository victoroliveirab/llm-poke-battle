export type MajorStatusKind = 'paralysis' | 'burn' | 'freeze';

export type MajorStatus = MajorStatusKind | null;

export type VolatileStatus =
  | {
      kind: 'confusion';
      turnsRemaining: number;
    };

export type VolatileStatusKind = VolatileStatus['kind'];

export type StatusKind = MajorStatusKind | VolatileStatusKind;

export type AppliedStatus = MajorStatusKind | VolatileStatus;

export type StatusState = {
  majorStatus: MajorStatus;
  volatileStatuses: VolatileStatus[];
};

export function hasMajorStatus(
  pokemon: Pick<StatusState, 'majorStatus'>,
  status: MajorStatusKind,
) {
  return pokemon.majorStatus === status;
}

export function hasVolatileStatus(
  pokemon: Pick<StatusState, 'volatileStatuses'>,
  status: VolatileStatusKind,
) {
  return pokemon.volatileStatuses.some((entry) => entry.kind === status);
}

export function getStatusKind(status: AppliedStatus | StatusKind) {
  return typeof status === 'string' ? status : status.kind;
}

export function isMajorStatusKind(status: StatusKind): status is MajorStatusKind {
  return status === 'paralysis' || status === 'burn' || status === 'freeze';
}

export function isVolatileStatusKind(
  status: StatusKind,
): status is VolatileStatusKind {
  return status === 'confusion';
}

export function cloneVolatileStatus(status: VolatileStatus): VolatileStatus {
  return { ...status };
}
