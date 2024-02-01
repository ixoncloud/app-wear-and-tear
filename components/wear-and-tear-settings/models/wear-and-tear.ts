import type { ComponentContextRawMetricInput } from '@ixon-cdk/types';

export interface WearAndTearItem {
  _id: string;
  _appConfigId: string;
  cycleStartDate: number | null;
  cycleStartValue: number;
  name: string;
  metric: ComponentContextRawMetricInput;
  resetOn: number | null;
  upperLimit: number;
  warningLimit: number | null;
}
