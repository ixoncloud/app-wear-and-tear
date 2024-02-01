import type { ResourceData } from '@ixon-cdk/types';
import type { WearAndTearItem } from '../models/wear-and-tear';

export function mapAssetAppConfigToItems(
  appConfig?: Partial<ResourceData.AssetAppConfig<Partial<WearAndTearItem>[], Partial<WearAndTearItem>[]>> | null,
): WearAndTearItem[] {
  const values = appConfig?.values ?? [];
  const stateValues = appConfig?.stateValues ?? [];
  const items = values.map(
    (value, i) =>
      Object.assign(
        { _appConfigId: appConfig?.publicId },
        value,
        stateValues.find(val => val._id === value._id) ?? stateValues[i],
      ) as WearAndTearItem,
  );
  return items;
}
