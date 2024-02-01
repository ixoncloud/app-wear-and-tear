<script lang="ts">
  import { onMount } from 'svelte';
  import type {
    ComponentContext,
    LoggingDataClient,
    LoggingDataMetric,
    LoggingDataQuery,
    ResourceData,
  } from '@ixon-cdk/types';
  import {
    type Readable,
    type Writable,
    derived,
    get,
    writable,
  } from 'svelte/store';
  import { naturalSort } from './lib/natural-sort';
  import type { WearAndTearItem } from './models/wear-and-tear';
  import { WearAndTearService } from './services/wear-and-tear.service';
  import { DateTime } from 'luxon';
  import { mapItemToQuery } from './utils/query';
  import {
    isTranslationKey,
    trimNamespace,
  } from './formatters/translation/translation.utils';
  import { mapMetricsToPreviousAndCurrent } from './utils/metrics';

  let asset: ResourceData.Asset | null = null;
  let itemQueryMap: Map<string, LoggingDataMetric[]> = new Map();
  let items: Writable<WearAndTearItem[]>;
  let loaded: boolean = false;
  let myUser: ResourceData.MyUser | null = null;
  let loggingDataClient: LoggingDataClient;
  let queries: Readable<LoggingDataQuery[]>;
  let service: WearAndTearService;
  let translations: { [key: string]: string } = {};

  let _cancelQuery: () => void | undefined;
  const _natSort = naturalSort();

  export let context: ComponentContext;

  onMount(async () => {
    translations = context.translate(
      [
        'LIMIT_EXPECTED_ON',
        'NAME',
        'NO_WEAR_AND_TEAR',
        'OVERDUE',
        'PROGRESS',
        'RESET',
      ],
      undefined,
      { source: 'global' },
    );
    items = writable<WearAndTearItem[]>([]);
    queries = derived(items, $items =>
      $items.map(item => mapItemToQuery(item, new Date(), context)),
    );
    loggingDataClient = context.createLoggingDataClient();
    const resourceDataClient = context.createResourceDataClient();
    service = new WearAndTearService(context);
    resourceDataClient.query(
      [
        { selector: 'Asset', fields: ['permissions', 'publicId'] },
        {
          selector: 'AssetAppConfigList',
          fields: ['publicId', 'stateValues', 'values'],
        },
        { selector: 'MyUser', fields: ['publicId', 'support'] },
      ],
      ([assetResult, configsResult, myUserResult]) => {
        asset = assetResult.data;
        myUser = myUserResult.data;
        items.set(service.getItemsForAssetAppConfigList(configsResult.data));
        loaded = true;
      },
    );
    const unsub = queries.subscribe($queries => {
      if ($queries.length) {
        runQueries($queries);
      }
    });

    // By updating the items, the queries will be recreated with a new "to" date
    context.ontimerangechange = () => items.update(_items => [..._items]);

    return () => {
      unsub();
      _cancelQuery?.();
      loggingDataClient.destroy();
      resourceDataClient.destroy();
    };
  });

  function runQueries(queries: LoggingDataQuery[]): void {
    _cancelQuery?.();
    _cancelQuery = loggingDataClient.query(queries, values => {
      get(items).map((item, i) => {
        itemQueryMap.set(item._id, [...values[i]].reverse());
      });
      itemQueryMap = new Map(itemQueryMap);
    });
  }

  function getItemIsActionable(
    _asset: ResourceData.Asset | null,
    _myUser: ResourceData.MyUser | null,
  ): boolean {
    // Company admin users are able to reset wear and tear items.
    if (_asset?.permissions?.includes('COMPANY_ADMIN')) {
      return true;
    }
    // Users with rights to manage this device are able to reset wear and tear items.
    if (_asset?.permissions?.includes('MANAGE_AGENT')) {
      return true;
    }
    // Support users are able to reset wear and tear items.
    if (_myUser?.support) {
      return true;
    }
    return false;
  }

  async function handleMoreActionsButtonClick(
    item: WearAndTearItem,
  ): Promise<void> {
    const actions = [{ title: context.translate('RESET'), destructive: true }];
    const result = await context.openActionBottomSheet({ actions });
    if (result) {
      switch (result.index) {
        case 0:
          handleResetItemButtonClick(item);
          break;
      }
    }
  }

  async function handleResetItemButtonClick(
    item: WearAndTearItem,
  ): Promise<void> {
    const confirmed = await context.openConfirmDialog({
      title: context.translate('RESET'),
      message: context.translate('__TEXT__.CONFIRM_RESET_NAME', {
        name: isTranslationKey(item.name)
          ? context.translate(trimNamespace(item.name))
          : item.name,
      }),
      confirmButtonText: context.translate('RESET'),
      confirmCheckbox: true,
      destructive: true,
    });
    if (asset && confirmed) {
      const resetOn = new Date().getTime();
      await service.resetItem(item._appConfigId, item._id, resetOn).then(() => {
        items.update(_items =>
          _items.map(_item =>
            _item._id === item._id ? { ..._item, resetOn } : _item,
          ),
        );
      });
    }
  }

  function _getMetrics(
    item: WearAndTearItem,
    _itemQueryMap: Map<string, LoggingDataMetric[]>,
  ): LoggingDataMetric[] | undefined {
    return _itemQueryMap.get(item._id);
  }

  function _getValue(
    item: WearAndTearItem,
    _itemQueryMap: Map<string, LoggingDataMetric[]>,
  ): number | undefined {
    const metrics = _getMetrics(item, _itemQueryMap);
    if (metrics && metrics.length) {
      const previousCurrent = mapMetricsToPreviousAndCurrent(item, metrics);
      if (previousCurrent) {
        return Math.abs(
          previousCurrent.previous.value - previousCurrent.current.value,
        );
      }
      return 0;
    }
  }

  function getProgressBarStyle(
    item: WearAndTearItem,
    _itemQueryMap: Map<string, LoggingDataMetric[]>,
  ): string {
    const value = _getValue(item, _itemQueryMap);
    const percentage =
      value !== undefined
        ? Math.min(Math.round((value / item.upperLimit) * 100), 100)
        : 0;
    return `width:${percentage}%`;
  }

  function getProgressClass(
    item: WearAndTearItem,
    _itemQueryMap: Map<string, LoggingDataMetric[]>,
  ): string {
    const value = _getValue(item, _itemQueryMap);
    if (value == undefined || value === 0) {
      return '';
    }
    if (value >= item.upperLimit) {
      return 'error';
    }
    if (typeof item.warningLimit === 'number' && value >= item.warningLimit) {
      return 'warn';
    }
    return 'success';
  }

  function getExpectedUpperLimitDate(
    item: WearAndTearItem,
    _itemQueryMap: Map<string, LoggingDataMetric[]>,
  ): number | undefined {
    const metrics = _getMetrics(item, _itemQueryMap);
    if (metrics && metrics.length) {
      const value = _getValue(item, _itemQueryMap);
      const previousCurrent = mapMetricsToPreviousAndCurrent(item, metrics);

      if (value && previousCurrent && value > 0) {
        if (value >= item.upperLimit) {
          return 1;
        }
        return Math.ceil(
          previousCurrent.current.time +
            ((previousCurrent.current.time - previousCurrent.previous.time) *
              (item.upperLimit - value)) /
              value,
        );
      }
    }
  }

  function getExpectedUpperLimitDateLabel(
    item: WearAndTearItem,
    _itemQueryMap: Map<string, LoggingDataMetric[]>,
  ): string | undefined {
    const expectedDate = getExpectedUpperLimitDate(item, _itemQueryMap);
    if (expectedDate) {
      const value = _getValue(item, _itemQueryMap);

      if (value && value >= item.upperLimit) {
        return translations.OVERDUE;
      }

      /**
       * If the expectedDate is in the past but the value has not reached the upperlimit,
       * it could be that the two datapoints are too close together to make an accurate calculation.
       */
      const now = DateTime.now().startOf('day').toMillis();
      if (expectedDate >= now) {
        return DateTime.fromMillis(expectedDate, {
          locale: context.appData.locale,
          zone: context.appData.timeZone,
        }).toLocaleString({
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
      }
    }
  }

  function getProgressLabelUnit(
    item: WearAndTearItem,
    _itemQueryMap: Map<string, LoggingDataMetric[]>,
  ): string {
    const value = _getMetrics(item, _itemQueryMap)?.[0]?.value;
    const unit = value?.getUnit();
    return unit ? ` ${unit}` : '';
  }

  function getProgressLabelValue(
    item: WearAndTearItem,
    _itemQueryMap: Map<string, LoggingDataMetric[]>,
  ): string {
    return _getValue(item, _itemQueryMap)?.toString() ?? '';
  }

  function getItemsOrderedByDate(
    _items: WearAndTearItem[],
    _itemQueryMap: Map<string, LoggingDataMetric[]>,
  ): WearAndTearItem[] {
    return [..._items].sort(
      (a, b) =>
        sortByDateComparer(a, b, _itemQueryMap) || sortByNameComparer(a, b),
    );
  }

  export function sortByNameComparer(
    a: WearAndTearItem,
    b: WearAndTearItem,
  ): number {
    return _natSort(a.name, b.name);
  }

  export function sortByDateComparer(
    a: WearAndTearItem,
    b: WearAndTearItem,
    _itemQueryMap: Map<string, LoggingDataMetric[]>,
  ): number {
    const itemOneDate = getExpectedUpperLimitDate(a, _itemQueryMap);
    const itemTwoDate = getExpectedUpperLimitDate(b, _itemQueryMap);

    if (itemOneDate === itemTwoDate) {
      return 0;
    }
    if (itemOneDate && itemTwoDate) {
      return itemOneDate > itemTwoDate ? 1 : -1;
    }
    return itemOneDate ? -1 : 1;
  }
</script>

<div class="card">
  <div class="card-header">
    <h3 class="card-title" data-testid="wear-and-tear-card-title">
      Wear and tear
    </h3>
  </div>
  <div class="card-content">
    {#if !!loaded}
      <div class="table-wrapper">
        <table class="table">
          <thead data-testid="wear-and-tear-table-head">
            <tr>
              <th class="col">{translations.NAME}</th>
              <th class="col">{translations.PROGRESS}</th>
              <th class="col">{translations.LIMIT_EXPECTED_ON}</th>
            </tr>
          </thead>
          <tbody>
            {#if !!$items?.length}
              {#each getItemsOrderedByDate($items, itemQueryMap) as item}
                <tr class="row" data-testid="wear-and-tear-table-row">
                  <td class="col">
                    <span class="name"
                      >{isTranslationKey(item.name)
                        ? context.translate(trimNamespace(item.name))
                        : item.name}</span
                    >
                  </td>
                  <td class="col">
                    {#if itemQueryMap.get(item._id)?.length}
                      <span
                        data-testid="wear-and-tear-progress-bar"
                        class="progress {getProgressClass(item, itemQueryMap)}"
                      >
                        <div class="progress-label">
                          <span class="progress-label-value"
                            >{getProgressLabelValue(item, itemQueryMap)}</span
                          ><span class="progress-label-value-of"
                            >/{item.upperLimit}</span
                          ><span class="progress-label-unit"
                            >{getProgressLabelUnit(item, itemQueryMap)}</span
                          >
                        </div>
                        <div class="progress-bar-container">
                          <div
                            class="progress-bar"
                            style={getProgressBarStyle(item, itemQueryMap)}
                          />
                        </div>
                      </span>
                    {:else}
                      <span class="no-progress">–</span>
                    {/if}
                  </td>
                  <td class="col">
                    <div class="col-container">
                      <span class="limit"
                        >{getExpectedUpperLimitDateLabel(item, itemQueryMap) ||
                          '–'}</span
                      >
                      {#if getItemIsActionable(asset, myUser)}
                        <div class="col-actions">
                          <button
                            class="button"
                            data-testid="wear-and-tear-item-reset-button"
                            on:click={() => handleResetItemButtonClick(item)}
                          >
                            {translations.RESET}
                          </button>
                          <button
                            class="icon-button more"
                            data-testid="wear-and-tear-item-more-options-button"
                            on:click={() => handleMoreActionsButtonClick(item)}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              height="24px"
                              viewBox="0 0 24 24"
                              width="24px"
                              ><path d="M0 0h24v24H0V0z" fill="none" /><path
                                d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"
                              /></svg
                            >
                          </button>
                        </div>
                      {/if}
                    </div>
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
      {#if !$items?.length}
        <div class="empty-state" data-testid="wear-and-tear-empty-state">
          <p>No wear and tear</p>
        </div>
      {/if}
    {:else}
      <div class="loading-state">
        <div class="spinner">
          <svg
            preserveAspectRatio="xMidYMid meet"
            focusable="false"
            viewBox="0 0 100 100"
          >
            <circle cx="50%" cy="50%" r="45" />
          </svg>
        </div>
      </div>
    {/if}
  </div>
</div>

<style lang="scss" scoped>
  @import './styles/button';
  @import './styles/card';
  @import './styles/spinner';

  .card {
    .card-header {
      display: flex;
      flex-direction: row;
      height: 40px;

      .card-title {
        flex: 1 0 auto;
      }
    }
  }

  .card-content {
    position: relative;
  }

  .table-wrapper {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
    padding: 0 8px;
    overflow: auto;
    overflow-anchor: none;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  table thead th {
    position: sticky;
    white-space: nowrap;
    background: var(--basic);
    top: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 7em;
    z-index: 10;
    text-align: left;
  }

  table thead tr {
    font-weight: 600;
    border-bottom: 1px solid var(--card-border-color);
  }

  table thead tr .col {
    padding: 0 6px 12px 0;
  }

  table thead tr,
  table tbody tr {
    height: 28px;

    .col:last-child {
      padding-right: 0;
    }
  }

  table tbody tr:hover {
    background-color: #f7f7f7;
  }

  table tbody tr .col {
    padding: 6px 6px 6px 0;
    line-height: 16px;
    border-bottom: 1px solid var(--card-border-color);
    vertical-align: top;
  }

  .col-container {
    position: relative;
    padding-right: 20px;
    min-height: 32px;

    @media (min-width: 640px) {
      min-height: 22px;
      padding-right: 0;
    }
  }

  .col .name {
    display: block;
    margin: 2px 0;
    font-size: 12px;
    line-height: 16px;
    white-space: pre-wrap;

    @media (min-width: 640px) {
      font-size: 14px;
    }
  }

  .col {
    .limit,
    .no-progress {
      line-height: 22px;

      @media (min-width: 640px) {
        font-size: 14px;
      }
    }
  }

  .col-actions {
    display: flex;
    box-sizing: border-box;
    flex-direction: row;
    align-items: center;
    place-content: space-between;
    position: absolute;
    padding: 0 8px;
    top: 0;
    right: 0;
    height: 100%;
    min-height: 32px;

    @media (min-width: 640px) {
      display: none;
      height: 20px;
      min-height: auto;
      align-items: flex-start;
      background: linear-gradient(
        90deg,
        rgba(247, 247, 247, 0) 0%,
        rgba(247, 247, 247, 1) 33%,
        rgba(247, 247, 247, 1) 100%
      );
    }

    .button {
      display: none;
      padding: 0 8px;
      height: 22px;
      line-height: 24px;
      font-size: 14px;
      background-color: transparent;
      color: var(--primary);

      @media (min-width: 640px) {
        display: inline-block;
      }
    }

    .icon-button {
      width: 24px;
      color: rgba(0, 0, 0, 0.67);

      &:not(.more) {
        display: none;
      }

      @media (min-width: 640px) {
        height: 20px;
        width: 20px;
        line-height: 20px;
        margin-left: 8px;

        > svg {
          margin: 0;
          height: 20px;
          width: 20px;
        }

        &:not(.more) {
          display: inline-block;
        }

        &.more {
          display: none;
        }
      }
    }
  }

  .col:hover .col-actions {
    display: flex;
  }

  .empty-state,
  .loading-state {
    display: flex;
    height: 100%;
    flex-direction: column;
    place-content: center;
    align-items: center;
  }

  .empty-state {
    font-size: 12px;
    color: rgba(0, 0, 0, 0.34);

    p {
      width: 100%;
      margin: 8px 0;
      text-align: center;
    }
  }

  /** Progress */
  .progress {
    .progress-bar-container {
      height: 5px;
      width: 100%;
      max-width: 100px;
      background-color: #efefef;
      position: relative;
      z-index: 1;

      @media (min-width: 640px) {
        max-width: 150px;
      }

      .progress-bar {
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        z-index: 10;
      }
    }

    &.success {
      .progress-label-value {
        color: var(--success);
      }
      .progress-bar-container .progress-bar {
        background-color: var(--success);
      }
    }

    &.warn {
      .progress-label-value {
        color: #df7d21;
      }
      .progress-bar-container .progress-bar {
        background-color: #df7d21;
      }
    }

    &.error {
      .progress-label-value {
        color: var(--warn);
      }
      .progress-bar-container .progress-bar {
        background-color: var(--warn);
      }
    }
  }
</style>
