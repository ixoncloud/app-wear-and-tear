import type { WearAndTearItem } from '../models/wear-and-tear';

export function mapAssetAppConfigToItems(appConfig?: any): WearAndTearItem[] {
  const values = appConfig?.values ?? [];
  const stateValues = appConfig?.stateValues ?? [];
  const items = values.map(
    (value: any, i: number) =>
      Object.assign(
        { _appConfigId: appConfig?.publicId },
        value,
        stateValues.find((val: any) => val._id === value._id) ?? stateValues[i],
      ) as WearAndTearItem,
  );
  return items;
}
