import type { LoggingDataMetric } from '@ixon-cdk/types';
import type { WearAndTearItem } from '../models/wear-and-tear';

export function mapMetricsToPreviousAndCurrent(
  item: WearAndTearItem,
  metrics: LoggingDataMetric[],
): { previous: { value: number; time: number }; current: { value: number; time: number } } | undefined {
  if (metrics && metrics.length) {
    // If resetOn is not set we use cycleStartValue and cycleStartDate as previous
    if (!item.resetOn && !!item.cycleStartDate) {
      const previous = { value: item.cycleStartValue, time: item.cycleStartDate };
      // It could be that query returns 1 point instead of 2 because it has no data logged before or after the cycleStartDate
      // If there is no data after the cycleStartDate we cannot do a calculation
      if (metrics.length === 1 && metrics[0].time > previous.time) {
        const current = metrics[0];
        return {
          previous,
          current: { value: current.value.getValue() as number, time: current.time },
        };
      } else if (metrics.length > 1) {
        const current = metrics[1];
        return {
          previous,
          current: { value: current.value.getValue() as number, time: current.time },
        };
      }
    } else if (metrics.length > 1) {
      const previous = metrics[0];
      const current = metrics[1];

      return {
        previous: { value: previous.value.getValue() as number, time: previous.time },
        current: { value: current.value.getValue() as number, time: current.time },
      };
    }
  }
}
