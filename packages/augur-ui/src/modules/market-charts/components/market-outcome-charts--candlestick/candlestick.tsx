import React from 'react';

import { loadCandleStickData } from 'modules/markets/actions/load-candlestick-data';
import logError from 'utils/log-error';
import { checkPropsChange } from 'utils/check-props-change';
import MarketOutcomeCandlestick from 'modules/market-charts/components/market-outcome-charts--candlestick/market-outcome-charts--candlestick';
import { BigNumber } from 'bignumber.js';
import {
  DEFAULT_SHORT_PERIODS_VALUE,
  DEFAULT_PERIODS_VALUE,
} from 'modules/common/constants';
import { PriceTimeSeriesData } from 'modules/types';

interface CandlestickProps {
  currentTimeInSeconds: number;
  marketId: string;
  maxPrice: BigNumber;
  minPrice: BigNumber;
  selectedOutcomeId: number;
  daysPassed: number;
  isMobile: boolean;
}

interface CandlestickState {
  priceTimeSeries: PriceTimeSeriesData[];
  selectedPeriod: number;
}
export class Candlestick extends React.Component<
  CandlestickProps,
  CandlestickState
> {
  static defaultProps = {
    isMobile: false,
  };

  constructor(props) {
    super(props);

    const defPeriod =
      props.daysPassed < 1
        ? DEFAULT_SHORT_PERIODS_VALUE
        : DEFAULT_PERIODS_VALUE;

    this.state = {
      priceTimeSeries: [],
      selectedPeriod: defPeriod,
    };

    this.getData = this.getData.bind(this);
    this.updateSelectedPeriod = this.updateSelectedPeriod.bind(this);
  }

  componentDidMount() {
    this.getData();
  }

  componentDidUpdate(prevProps, prevState) {
    if (
      checkPropsChange(prevProps, this.props, [
        'currentTimeInSeconds',
        'selectedOutcomeId',
        'marketId',
      ]) ||
      checkPropsChange(prevState, this.state, ['selectedPeriod'])
    ) {
      this.getData();
    }
  }

  getData() {
    const { currentTimeInSeconds, marketId, selectedOutcomeId } = this.props;
    const { selectedPeriod } = this.state;
    
    loadCandleStickData(
      {
        marketId,
        period: selectedPeriod,
        end: currentTimeInSeconds,
        start: 0,
        outcome: selectedOutcomeId,
      },
      (err, data) => {
        if (err) return logError(err);
        const priceTimeSeries = data[selectedOutcomeId] || [];
        this.setState({
          priceTimeSeries,
        });
      }
    );
  }

  updateSelectedPeriod(selectedPeriod) {
    this.setState({
      selectedPeriod,
    });
  }

  render() {
    const {isMobile, maxPrice, minPrice } = this.props;
    const { priceTimeSeries, selectedPeriod } = this.state;

    return (
      <MarketOutcomeCandlestick
        priceTimeSeries={priceTimeSeries}
        isMobile={isMobile}
        fixedPrecision={2}
        pricePrecision={2}
        selectedPeriod={selectedPeriod}
        updateSelectedPeriod={this.updateSelectedPeriod}
        marketMax={maxPrice}
        marketMin={minPrice}
      />
    );
  }
}
