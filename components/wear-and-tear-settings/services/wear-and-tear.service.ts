import { omit } from 'lodash-es';
import type { AssetAppConfig, ComponentContext, IxApiResponse, ResourceData, ResourceDataClient } from '@ixon/types';
import type { WearAndTearItem } from '../models/wear-and-tear';
import { mapAssetAppConfigToItems } from '../utils/wear-and-tear.utils';

export class WearAndTearService {
  private _client: ResourceDataClient;

  constructor(private _context: ComponentContext) {
    this._client = _context.createResourceDataClient();
  }

  addItem(
    config: ResourceData.AssetAppConfig<Partial<WearAndTearItem>[], Partial<WearAndTearItem>[]> | null,
    data: Partial<WearAndTearItem>,
  ): Promise<void> {
    const _id = crypto.randomUUID() as string;
    const value: Partial<WearAndTearItem> = { _id, ...data };
    const stateValue: Partial<WearAndTearItem> = { _id };
    const values = [...(config?.values ?? []), value];
    const stateValues = [...(config?.stateValues ?? []), stateValue];
    return this._client.update({
      selector: 'AssetAppConfig',
      data: {
        values: values,
        stateValues: stateValues,
      },
    });
  }

  getItemsForAssetAppConfig(
    config: ResourceData.AssetAppConfig<Partial<WearAndTearItem>[], Partial<WearAndTearItem>[]> | null,
  ): WearAndTearItem[] {
    return mapAssetAppConfigToItems(config);
  }

  getItemsForAssetAppConfigList(
    configs: ResourceData.AssetAppConfig<Partial<WearAndTearItem>[], Partial<WearAndTearItem>[]>[] | null,
  ): WearAndTearItem[] {
    return configs?.flatMap(config => mapAssetAppConfigToItems(config)) ?? [];
  }

  removeItem(
    config: ResourceData.AssetAppConfig<Partial<WearAndTearItem>[], Partial<WearAndTearItem>[]>,
    itemId: string,
  ): Promise<void> {
    const values = [...(config?.values ?? [])].filter(val => val._id !== itemId);
    const stateValues = [...(config?.values ?? [])].filter(val => val._id !== itemId);
    return this._client.update({ selector: 'AssetAppConfig', data: { values, stateValues } });
  }

  resetItem(configId: string, itemId: string, resetOn: number): Promise<void> {
    const url = new URL(this._context.getApiUrl('AssetAppConfig', { publicId: configId }));
    url.searchParams.append('fields', 'publicId,stateValues');
    const headers = this._getHeaders();
    return fetch(url.toString(), { headers })
      .then<IxApiResponse<AssetAppConfig>>(res => res.json())
      .then(response => {
        if (response.data.stateValues) {
          const stateValues = JSON.parse(response.data.stateValues);
          stateValues.forEach((stateValue: { _id: string; resetOn: number }) => {
            if (stateValue._id === itemId) {
              stateValue.resetOn = resetOn;
            }
          });
          this._updateAssetConfig({ publicId: configId, stateValues: JSON.stringify(stateValues) });
        }
      });
  }

  updateItem(config: ResourceData.AssetAppConfig, itemId: string, update: Partial<WearAndTearItem>): Promise<void> {
    let values = (config?.values as WearAndTearItem[]) ?? [];
    if (values.some(val => val._id === itemId)) {
      const valUpdate = omit(update, ['_appConfigId', 'resetOn']);
      values = values.map(val => (val._id === itemId ? { ...val, ...valUpdate } : val));
    }
    return this._client.update({
      selector: 'AssetAppConfig',
      data: { values, stateValues: config?.stateValues ?? [] },
    });
  }

  private _getHeaders(): Record<string, string> {
    return {
      'Api-Application': this._context.appData.apiAppId,
      'Api-Version': this._context.appData.apiVersion,
      'Api-Company': this._context.appData.company.publicId,
      Authorization: `Bearer ${this._context.appData.accessToken.secretId}`,
    };
  }

  private _updateAssetConfig(config: AssetAppConfig): Promise<Response> {
    const url = new URL(this._context.getApiUrl('AssetAppConfigList'));
    const headers = this._getHeaders();
    return fetch(url.toString(), { headers, method: 'PATCH', body: JSON.stringify(config) });
  }
}
