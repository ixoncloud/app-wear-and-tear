import type { ComponentContext, LoggingDataQuery } from '@ixon-cdk/types';
import type { WearAndTearItem } from '../models/wear-and-tear';
import { isTranslationKey, trimNamespace } from '../formatters/translation/translation.utils';

export function mapItemToQuery(item: WearAndTearItem, now: Date, context: ComponentContext): LoggingDataQuery {
  const from = item.resetOn ? new Date(item.resetOn) : new Date(item.cycleStartDate || now);
  const to = now > from ? now : from;

  return {
    selector: item.metric.selector,
    postAggr: 'raw',
    decimals: item.metric.decimals || 0,
    from: from.toISOString(),
    to: to.toISOString(),
    limit: 1,
    extendedBoundary: true,
    ...(item.metric.factor !== null ? { factor: item.metric.factor } : {}),
    ...(item.metric.unit !== null
      ? {
          unit: isTranslationKey(item.metric.unit)
            ? context.translate(trimNamespace(item.metric.unit))
            : item.metric.unit,
        }
      : {}),
  };
}
