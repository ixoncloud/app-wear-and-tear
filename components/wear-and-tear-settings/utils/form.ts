import type { WearAndTearItem } from '../models/wear-and-tear';
import { DateTime } from 'luxon';

export function getFormInputs(translations: Record<string, string>, isEditing = false, hasStartingPoint = true) {
  return [
    {
      key: 'name',
      type: 'String',
      label: translations.NAME,
      required: true,
    },
    {
      key: 'metric',
      label: translations.METRIC,
      type: 'RawMetric',
      allowedTypes: ['int'],
      required: true,
    },
    {
      key: 'threshold',
      type: 'Group',
      label: translations.THRESHOLD,
      children: [
        {
          key: 'warningLimit',
          type: 'Number',
          min: 0,
          label: translations.WARNING_LIMIT,
        },
        {
          key: 'upperLimit',
          type: 'Number',
          min: 0,
          label: translations.UPPER_LIMIT,
          required: true,
        },
      ],
    },
    ...(hasStartingPoint
      ? [
          {
            key: 'startingPoint',
            type: 'Group',
            label: translations.STARTING_POINT,
            description: translations['__TEXT__.STARTING_POINT_INFO'],
            children: [
              {
                key: 'cycleStartValue',
                type: 'Number',
                min: 0,
                defaultValue: 0,
                label: translations.CYCLE_START_VALUE,
                required: true,
                disabled: isEditing,
              },
              {
                key: 'cycleStartDate',
                type: 'Date',
                defaultValue: DateTime.now().startOf('day').toISO(),
                label: translations.CYCLE_START_DATE,
                required: true,
                disabled: isEditing,
              },
            ],
          },
        ]
      : []),
  ];
}

export function mapFormValueToItem(formValue: any): Partial<WearAndTearItem> {
  return {
    cycleStartDate: formValue.startingPoint?.cycleStartDate
      ? DateTime.fromISO(formValue.startingPoint.cycleStartDate).toMillis()
      : null,
    cycleStartValue: formValue.startingPoint?.cycleStartValue,
    name: formValue.name,
    metric: formValue.metric,
    upperLimit: formValue.threshold.upperLimit,
    warningLimit: formValue.threshold.warningLimit,
  };
}

export function mapItemToFormValue(item: WearAndTearItem): any {
  return {
    name: item.name,
    metric: item.metric,
    startingPoint: {
      cycleStartDate: item.cycleStartDate ? DateTime.fromMillis(item.cycleStartDate).toISODate() : null,
      cycleStartValue: item.cycleStartValue,
    },
    threshold: {
      upperLimit: item.upperLimit,
      warningLimit: item.warningLimit,
    },
  };
}
