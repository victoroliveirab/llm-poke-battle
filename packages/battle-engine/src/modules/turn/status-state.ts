export type MajorStatusKind =
  | 'paralysis'
  | 'burn'
  | 'freeze'
  | 'sleep'
  | 'poison'
  | 'badly-poisoned';

export type MajorStatus =
  | null
  | {
      kind: 'paralysis';
    }
  | {
      kind: 'burn';
    }
  | {
      kind: 'freeze';
    }
  | {
      kind: 'sleep';
      turnsRemaining: number;
    }
  | {
      kind: 'poison';
    }
  | {
      kind: 'badly-poisoned';
      turnsElapsed: number;
    };

export type VolatileStatus =
  | {
      kind: 'confusion';
      turnsRemaining: number;
    }
  | {
      kind: 'infatuation';
    };

const CONFUSION_MIN_DURATION = 1;
const CONFUSION_MAX_DURATION = 4;
const SLEEP_MIN_DURATION = 1;
const SLEEP_MAX_DURATION = 4;

export type VolatileStatusKind = VolatileStatus['kind'];

export type StatusKind = MajorStatusKind | VolatileStatusKind;

export type AppliedStatus = Exclude<MajorStatus, null> | VolatileStatus;

export type StatusState = {
  majorStatus: MajorStatus;
  volatileStatuses: VolatileStatus[];
};

export function hasMajorStatus(
  pokemon: Pick<StatusState, 'majorStatus'>,
  status: MajorStatusKind,
) {
  return pokemon.majorStatus?.kind === status;
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

export function isMajorStatusKind(
  status: StatusKind,
): status is MajorStatusKind {
  return (
    status === 'paralysis' ||
    status === 'burn' ||
    status === 'freeze' ||
    status === 'sleep' ||
    status === 'poison' ||
    status === 'badly-poisoned'
  );
}

export function isVolatileStatusKind(
  status: StatusKind,
): status is VolatileStatusKind {
  return status === 'confusion' || status === 'infatuation';
}

export function cloneMajorStatus(status: MajorStatus): MajorStatus {
  if (status === null) {
    return null;
  }

  return { ...status };
}

export function cloneVolatileStatus(status: VolatileStatus): VolatileStatus {
  return { ...status };
}

export function clearVolatileStatuses(
  pokemon: Pick<StatusState, 'volatileStatuses'>,
) {
  pokemon.volatileStatuses = [];
}

export function createVolatileStatus(
  kind: VolatileStatusKind,
  random: () => number,
): VolatileStatus {
  switch (kind) {
    case 'confusion':
      return {
        kind: 'confusion',
        turnsRemaining:
          Math.floor(
            random() * (CONFUSION_MAX_DURATION - CONFUSION_MIN_DURATION + 1),
          ) + CONFUSION_MIN_DURATION,
      };
    case 'infatuation':
      return {
        kind: 'infatuation',
      };
  }
}

export function createMajorStatus(
  kind: MajorStatusKind,
  random: () => number,
): Exclude<MajorStatus, null> {
  switch (kind) {
    case 'paralysis':
      return { kind: 'paralysis' };
    case 'burn':
      return { kind: 'burn' };
    case 'freeze':
      return { kind: 'freeze' };
    case 'sleep':
      return {
        kind: 'sleep',
        turnsRemaining:
          Math.floor(random() * (SLEEP_MAX_DURATION - SLEEP_MIN_DURATION + 1)) +
          SLEEP_MIN_DURATION,
      };
    case 'poison':
      return { kind: 'poison' };
    case 'badly-poisoned':
      return {
        kind: 'badly-poisoned',
        turnsElapsed: 1,
      };
  }
}
