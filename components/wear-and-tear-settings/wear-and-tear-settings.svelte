<script lang="ts">
  import { onMount } from 'svelte';
  import { writable, type Readable, derived } from 'svelte/store';
  import type { ComponentContext, ResourceData } from '@ixon-cdk/types';
  import { WearAndTearService } from 'services/wear-and-tear.service';
  import type { WearAndTearItem } from 'models/wear-and-tear';
  import {
    getFormInputs,
    mapFormValueToItem,
    mapItemToFormValue,
  } from './utils/form';
  import { naturalSort } from 'lib/natural-sort';
  import {
    isTranslationKey,
    trimNamespace,
  } from 'formatters/translation/translation.utils';
  import { DateTime } from 'luxon';

  export let context: ComponentContext;

  let assetAppConfig: ResourceData.AssetAppConfig | null;
  let items = writable<WearAndTearItem[]>([]);
  let orderedItems: Readable<WearAndTearItem[]>;
  let service: WearAndTearService;
  let translations: Record<string, string> = {};

  onMount(() => {
    const _natSort = naturalSort();
    translations = context.translate(
      [
        '__TEXT__.STARTING_POINT_INFO',
        'ADD_ITEM',
        'ADD',
        'CONFIRM',
        'CYCLE_START_DATE',
        'CYCLE_START_VALUE',
        'DECIMALS',
        'DELETE',
        'EDIT_ITEM',
        'FACTOR',
        'METRIC',
        'NAME',
        'REMOVE',
        'STARTING_POINT',
        'TAG',
        'THRESHOLD',
        'UNIT',
        'UPPER_LIMIT',
        'WARNING_LIMIT',
      ],
      undefined,
      { source: 'global' },
    );

    orderedItems = derived(items, $items =>
      $items.sort((a, b) => _natSort(a.name, b.name)),
    );
    const client = context.createResourceDataClient();
    service = new WearAndTearService(context);
    client.query(
      [
        {
          selector: 'Asset',
          fields: ['publicId'],
        },
        {
          selector: 'AssetAppConfig',
          fields: ['publicId', 'values', 'stateValues'],
        },
      ],
      ([assetResult, configResult]) => {
        if (assetResult.data) {
          assetAppConfig = configResult.data;
          items.set(service.getItemsForAssetAppConfig(configResult.data));
        }
      },
    );
    return () => {
      client.destroy();
    };
  });

  function getFormattedSelector(selector: string | undefined): string {
    return selector?.split(':')?.[1] || '–';
  }

  async function handleAddItemButtonClick(): Promise<void> {
    const result = await context.openFormDialog({
      title: translations.ADD_ITEM,
      inputs: getFormInputs(translations),
      submitButtonText: translations.ADD,
    });
    if (result && result.value) {
      await service.addItem(assetAppConfig, mapFormValueToItem(result.value));
    }
  }

  async function handleEditItemButtonClick(
    item: WearAndTearItem,
  ): Promise<void> {
    const result = await context.openFormDialog({
      title: translations.EDIT_ITEM,
      inputs: getFormInputs(translations, true, !!item.cycleStartDate),
      initialValue: mapItemToFormValue(item),
      submitButtonText: translations.CONFIRM,
    });
    if (result && result.value && assetAppConfig) {
      const update = mapFormValueToItem(result.value);
      await service.updateItem(assetAppConfig, item._id, update);
    }
  }

  async function handleRemoveItemButtonClick(
    item: WearAndTearItem,
  ): Promise<void> {
    const confirmed = await context.openConfirmDialog({
      title: translations.DELETE,
      message: context.translate(
        '__TEXT__.CONFIRM_DELETE',
        { name: item.name },
        { source: 'global' },
      ),
      confirmButtonText: translations.REMOVE,
      confirmCheckbox: true,
      destructive: true,
    });
    if (confirmed && assetAppConfig) {
      await service.removeItem(assetAppConfig, item._id);
    }
  }
</script>

<div class="card">
  <div class="card-content">
    <div class="table-wrapper">
      <div class="table">
        <!-- header row -->
        <div
          class="row row-header"
          data-testid="wear-and-tear-settings-table-header"
        >
          <div class="cell">
            <span>{translations.NAME}</span>
          </div>
          <div class="cell">
            <span>{translations.TAG}</span>
          </div>
          <div class="cell">
            <span>{translations.WARNING_LIMIT}</span>
          </div>
          <div class="cell">
            <span>{translations.UPPER_LIMIT}</span>
          </div>
          <div class="cell">
            <span>{translations.DECIMALS}</span>
          </div>
          <div class="cell">
            <span>{translations.UNIT}</span>
          </div>
          <div class="cell">
            <span>{translations.FACTOR}</span>
          </div>
          <div class="cell">
            <span>{translations.CYCLE_START_VALUE}</span>
          </div>
          <div class="cell">
            <span>{translations.CYCLE_START_DATE}</span>
          </div>
          <div class="cell" />
        </div>
        <!-- body rows -->
        {#if !!$orderedItems?.length}
          {#each $orderedItems as item}
            <div class="row-group">
              <div class="row" data-testid="wear-and-tear-settings-table-row">
                <div class="cell">
                  {isTranslationKey(item.name)
                    ? context.translate(trimNamespace(item.name))
                    : item.name}
                </div>
                <div class="cell">
                  {getFormattedSelector(item.metric.selector)}
                </div>
                <div class="cell">{item.warningLimit ?? '–'}</div>
                <div class="cell">{item.upperLimit ?? '–'}</div>
                <div class="cell">{item.metric.decimals ?? '–'}</div>
                <div class="cell">
                  {item.metric.unit
                    ? isTranslationKey(item.metric.unit)
                      ? context.translate(trimNamespace(item.metric.unit))
                      : item.metric.unit
                    : '–'}
                </div>
                <div class="cell">{item.metric.factor ?? '–'}</div>
                <div class="cell">{item.cycleStartValue ?? '–'}</div>
                <div class="cell">
                  {item.cycleStartDate
                    ? DateTime.fromMillis(item.cycleStartDate).toLocaleString()
                    : '–'}
                </div>
                <div class="cell cell__actions">
                  <button
                    class="icon-button"
                    data-testid="wear-and-tear-settings-edit-button"
                    on:click={() => handleEditItemButtonClick(item)}
                  >
                    <svg height="20px" viewBox="0 0 24 24" width="20px"
                      ><path d="M0 0h24v24H0V0z" fill="none" /><path
                        d="M14.06 9.02l.92.92L5.92 19H5v-.92l9.06-9.06M17.66 3c-.25 0-.51.1-.7.29l-1.83 1.83 3.75 3.75 1.83-1.83c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.2-.2-.45-.29-.71-.29zm-3.6 3.19L3 17.25V21h3.75L17.81 9.94l-3.75-3.75z"
                      />
                    </svg>
                  </button>
                  <button
                    class="icon-button"
                    data-testid="wear-and-tear-settings-remove-button"
                    on:click={() => handleRemoveItemButtonClick(item)}
                  >
                    <svg height="20px" viewBox="0 0 24 24" width="20px"
                      ><path d="M0 0h24v24H0V0z" fill="none" /><path
                        d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1zM18 7H6v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7z"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </div>
    <button
      data-testid="wear-and-tear-settings-add-button"
      class="button fab-button accent"
      on:click={handleAddItemButtonClick}
    >
      <div>
        <svg height="24" viewBox="0 -960 960 960" width="24"
          ><path
            d="M450-200v-250H200v-60h250v-250h60v250h250v60H510v250h-60Z"
          /></svg
        >
        <span>{translations.ADD_ITEM}</span>
      </div>
    </button>
  </div>
</div>

<style lang="scss">
  @import './styles/card';
  @import './styles/button';

  div.card-content {
    $bannerHeight: 57px;
    $captionHeight: 56px;
    $headerRowHeight: 50px;
    $headerBgColor: #f5f5f5;
    $defaultRowHeight: 40px;
    padding: 16px !important;

    .table-wrapper {
      display: block;
      box-sizing: border-box;
      height: 100%;
      width: 100%;
      position: relative;

      .table {
        display: table;
        min-width: 100%;
        box-shadow: 0 0px 0 1px var(--card-border-color);
        margin-bottom: calc(
          88px +
            (
              -1 * (var(--vpn-status-bar-offset, 0px) +
                    var(--temporary-access-snack-bar-offset, 0px))
            )
        );

        .row-group {
          display: table-row-group;
          height: $defaultRowHeight;
        }

        .row:not(.row-header) {
          background-color: var(--body-bg);

          &:hover .cell {
            background-color: $headerBgColor;
          }

          .cell {
            color: rgba(0, 0, 0, 0.87);
            box-sizing: border-box;
            border-bottom: 1px solid var(--card-border-color);
          }
        }

        .row-group:last-of-type {
          .row .cell {
            border-bottom: 0;
          }
        }

        .row {
          display: table-row;
          height: $defaultRowHeight;

          &.row-header {
            position: sticky;
            top: 0;
            z-index: 10;
            background-color: var(--body-bg);
            height: $headerRowHeight;

            .cell {
              height: $headerRowHeight;
              box-sizing: border-box;
              background-color: $headerBgColor;
              border-bottom: 1px solid rgba(0, 0, 0, 0.12);
              white-space: nowrap;
              font-size: 12px;
              color: rgba(0, 0, 0, 0.54);
            }
          }

          .cell {
            display: table-cell;
            vertical-align: middle;
            height: $defaultRowHeight;
            padding: 0 5px;
            font-size: 14px;
          }

          .cell__actions {
            width: 150px;
            padding-right: 4px;
            text-align: right;
          }
        }
      }
    }

    .icon-button {
      svg {
        fill: rgba(0, 0, 0, 0.87);
      }
    }

    .fab-button {
      font-family: Roboto, 'Helvetica Neue', sans-serif;
      height: 56px;
      border-radius: 28px;
      position: absolute;
      z-index: 10;
      right: 16px;
      bottom: 16px;
      transform: translateY(
        calc(
          var(--vpn-status-bar-offset, 0px) +
            var(--temporary-access-snack-bar-offset, 0px)
        )
      );
      box-shadow:
        0px 3px 5px -1px rgba(0, 0, 0, 0.2),
        0px 6px 10px 0px rgba(0, 0, 0, 0.14),
        0px 1px 18px 0px rgba(0, 0, 0, 0.12);

      div {
        flex-direction: row;
        box-sizing: border-box;
        display: flex;
        place-content: center flex-start;
        align-items: center;

        svg {
          margin-right: 4px;
          fill: var(--accent-color);
        }
      }
    }
  }
</style>
