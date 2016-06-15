/**
 * augur.js tests
 * @author Jack Peterson (jack@tinybike.net)
 */

"use strict";

var fs = require("fs");
var join = require("path").join;
var assert = require("chai").assert;
var async = require("async");
var abi = require("augur-abi");
var chalk = require("chalk");
var augurpath = "../../src/index";
var augur = require(augurpath);
var runner = require("../runner");
var tools = require("../tools");
var rpc = augur.rpc;

describe("Unit tests", function () {
    describe("eth_call", function () {
        runner(this.title, [{
            method: "makeTradeHash",
            parameters: ["fixed", "fixed", "hashArray"]
        }, {
            method: "getInitialTrade",
            parameters: ["hash"]
        }, {
            method: "checkHash",
            parameters: ["hash", "address"]
        }, {
            method: "getID",
            parameters: ["hash"]
        }, {
            method: "get_trade",
            parameters: ["hash"]
        }, {
            method: "get_amount",
            parameters: ["hash"]
        }, {
            method: "get_price",
            parameters: ["hash"]
        }]);
    });
    describe("eth_sendTransaction", function () {
        runner(this.title, [{
            method: "setInitialTrade",
            parameters: ["hash"]
        }, {
            method: "commitTrade",
            parameters: ["hash"]
        }, {
            method: "zeroHash",
            parameters: []
        }, {
            method: "saveTrade",
            parameters: ["hash", "int", "hash", "fixed", "fixed", "address", "int"]
        }, {
            method: "update_trade",
            parameters: ["hash", "fixed"]
        }, {
            method: "remove_trade",
            parameters: ["hash"]
        }, {
            method: "fill_trade",
            parameters: ["hash", "fixed"]
        }, {
            method: "cancel",
            parameters: ["hash"]
        }, {
            method: "buy",
            parameters: ["fixed", "fixed", "hash", "int"]
        }, {
            method: "sell",
            parameters: ["fixed", "fixed", "hash", "int"]
        }]);
    });
    describe("multiTrade", function () {

        var buy, sell, trade, short_sell, buyCompleteSets;

        var requests = {};
        var unexpectedEvents = {
            onBuySellSuccess: function (requestId, res) {
                requests[requestId].done(new Error("unexpected buy/sell"));
            },
            onTradeSuccess: function (requestId, res) {
                requests[requestId].done(new Error("unexpected trade/short_sell"));
            },
            onBuyCompleteSetsSuccess: function (requestId, res) {
                requests[requestId].done(new Error("unexpected buyCompleteSets"));
            },
            onCommitFailed: function (requestId, err) {
                requests[requestId].done(new Error(JSON.stringify(err)));
            },
            onBuySellFailed: function (requestId, err) {
                requests[requestId].done(new Error(JSON.stringify(err)));
            },
            onTradeFailed: function (requestId, err) {
                requests[requestId].done(new Error(JSON.stringify(err)));
            },
            onBuyCompleteSetsFailed: function (requestId, err) {
                requests[requestId].done(new Error(JSON.stringify(err)));
            }
        };

        before("multiTrade", function () {
            buy = augur.buy;
            sell = augur.sell;
            trade = augur.trade;
            short_sell = augur.short_sell;
            buyCompleteSets = augur.buyCompleteSets;
        });

        after("multiTrade", function () {
            assert.strictEqual(Object.keys(requests).length, 0);
            augur.buy = buy;
            augur.sell = sell;
            augur.trade = trade;
            augur.short_sell = short_sell;
            augur.buyCompleteSets = buyCompleteSets;
        });

        var test = function (t) {
            it(JSON.stringify(t), function (done) {
                this.timeout(tools.TIMEOUT);
                requests[t.requestId] = {done: done};
                augur.buy = function (p) {
                    assert(p.amount);
                    assert(p.price);
                    assert(p.market);
                    assert(p.outcome);
                    assert.isFunction(p.onSent);
                    assert.isFunction(p.onSuccess);
                    assert.isFunction(p.onFailed);
                    p.onSuccess({callReturn: "1"});
                };
                augur.sell = function (p) {
                    assert(p.amount);
                    assert(p.price);
                    assert(p.market);
                    assert(p.outcome);
                    assert.isFunction(p.onSent);
                    assert.isFunction(p.onSuccess);
                    assert.isFunction(p.onFailed);
                    p.onSuccess({callReturn: "1"});
                };
                augur.trade = function (p) {
                    assert.property(p, "max_value");
                    assert.property(p, "max_amount");
                    assert.isArray(p.trade_ids);
                    assert.isFunction(p.onTradeHash);
                    assert.isFunction(p.onCommitSent);
                    assert.isFunction(p.onCommitSuccess);
                    assert.isFunction(p.onCommitFailed);
                    assert.isFunction(p.onNextBlock);
                    assert.isFunction(p.onTradeSent);
                    assert.isFunction(p.onTradeSuccess);
                    assert.isFunction(p.onTradeFailed);
                    p.onTradeSuccess({callReturn: [, t.etherNotFilled || "0", t.sharesNotSold || "0"]});
                };
                augur.short_sell = function (p) {
                    assert(p.buyer_trade_id);
                    assert.property(p, "max_amount");
                    assert.isFunction(p.onTradeHash);
                    assert.isFunction(p.onCommitSent);
                    assert.isFunction(p.onCommitSuccess);
                    assert.isFunction(p.onCommitFailed);
                    assert.isFunction(p.onNextBlock);
                    assert.isFunction(p.onTradeSent);
                    assert.isFunction(p.onTradeSuccess);
                    assert.isFunction(p.onTradeFailed);
                    var index = requests[t.requestId].shortSellCount || 0;
                    var sharesLeft = abi.bignum(p.max_amount).minus(abi.bignum(t.marketOrderBook.buy[index].amount)).toFixed();
                    p.onTradeSuccess({callReturn: [, sharesLeft]});
                };
                augur.buyCompleteSets = function (p) {
                    assert(p.market);
                    assert(p.amount);
                    assert.isFunction(p.onSent);
                    assert.isFunction(p.onSuccess);
                    assert.isFunction(p.onFailed);
                    p.onSuccess({callReturn: "1"});
                };
                var value = abi.bignum(t.amount).times(abi.bignum(t.limitPrice)).toFixed();
                augur.multiTrade({
                    requestId: t.requestId,
                    market: t.market,
                    marketOrderBook: t.marketOrderBook,
                    userTradeOrdersPerOutcome: [{
                        type: t.type,
                        shares: {value: t.amount},
                        ether: {value: value},
                        limitPrice: t.limitPrice,
                        data: {outcomeID: t.outcome}
                    }],
                    positionsPerOutcome: t.positionsPerOutcome,
                    onTradeHash: t.onTradeHash,
                    onCommitSent: t.onCommitSent,
                    onCommitFailed: t.onCommitFailed || unexpectedEvents.onCommitFailed,
                    onNextBlock: t.onNextBlock,
                    onTradeSent: t.onTradeSent,
                    onTradeSuccess: t.onTradeSuccess || unexpectedEvents.onTradeSuccess,
                    onTradeFailed: t.onTradeFailed || unexpectedEvents.onTradeFailed,
                    onBuySellSent: t.onBuySellSent,
                    onBuySellSuccess: t.onBuySellSuccess || unexpectedEvents.onBuySellSuccess,
                    onBuySellFailed: t.onBuySellFailed || unexpectedEvents.onBuySellFailed,
                    onBuyCompleteSetsSent: t.onBuyCompleteSetsSent,
                    onBuyCompleteSetsSuccess: t.onBuyCompleteSetsSuccess || unexpectedEvents.onBuyCompleteSetsSuccess,
                    onBuyCompleteSetsFailed: t.onBuyCompleteSetsFailed || unexpectedEvents.onBuyCompleteSetsFailed
                });
            });
        };

        // buy order: create buy order for outcome 1
        test({
            requestId: 1,
            market: "0xdeadbeef",
            amount: 1,
            outcome: "1",
            limitPrice: "0.6",
            type: "buy_shares",
            marketOrderBook: {buy: [], sell: []},
            positionsPerOutcome: {
                "1": {qtyShares: 0},
                "2": {qtyShares: 0}
            },
            onBuySellSuccess: function (requestId, res) {
                requests[requestId].done();
                delete requests[requestId];
            }
        });

        // buy order: create buy order for outcome 2
        test({
            requestId: 2,
            market: "0xdeadbeef",
            amount: 1,
            outcome: "2",
            limitPrice: "0.6",
            type: "buy_shares",
            marketOrderBook: {buy: [], sell: []},
            positionsPerOutcome: {
                "1": {qtyShares: 0},
                "2": {qtyShares: 0}
            },
            onBuySellSuccess: function (requestId, res) {
                requests[requestId].done();
                delete requests[requestId];
            }
        });

        // buy order: match existing sell order exactly
        test({
            requestId: 3,
            market: "0xdeadbeef",
            amount: 1,
            outcome: "1",
            limitPrice: "0.9",
            type: "buy_shares",
            marketOrderBook: {
                buy: [],
                sell: [{
                    id: "0x123456789abcdef",
                    type: "sell",
                    market: "0xdeadbeef",
                    amount: "1",
                    price: "0.9",
                    owner: "0x0000000000000000000000000000000000001337",
                    block: 1117314,
                    outcome: "1"
                }]
            },
            positionsPerOutcome: {
                "1": {qtyShares: 0},
                "2": {qtyShares: 0}
            },
            onTradeSuccess: function (requestId, res) {
                requests[requestId].done();
                delete requests[requestId];
            }
        });

        // buy order: partial match for existing sell order
        test({
            requestId: 4,
            market: "0xdeadbeef",
            amount: 1,
            outcome: "1",
            limitPrice: "0.9",
            type: "buy_shares",
            etherNotFilled: "0.4",
            marketOrderBook: {
                buy: [],
                sell: [{
                    id: "0x123456789abcdef",
                    type: "sell",
                    market: "0xdeadbeef",
                    amount: "0.5",
                    price: "0.9",
                    owner: "0x0000000000000000000000000000000000001337",
                    block: 1117314,
                    outcome: "1"
                }]
            },
            positionsPerOutcome: {
                "1": {qtyShares: 0},
                "2": {qtyShares: 0}
            },
            onBuySellSuccess: function (requestId, res) {
                requests[requestId].buySell = true;
            },
            onTradeSuccess: function (requestId, res) {
                assert.isTrue(requests[requestId].buySell);
                requests[requestId].done();
                delete requests[requestId];
            }
        });

        // sell order (have shares): create sell order
        test({
            requestId: 5,
            market: "0xdeadbeef",
            amount: 1,
            outcome: "1",
            limitPrice: "0.6",
            type: "sell_shares",
            marketOrderBook: {buy: [], sell: []},
            positionsPerOutcome: {
                "1": {qtyShares: 1},
                "2": {qtyShares: 0}
            },
            onBuySellSuccess: function (requestId, res) {
                requests[requestId].done();
                delete requests[requestId];
            }
        });

        // sell shares (have shares): match existing buy order exactly
        test({
            requestId: 6,
            market: "0xdeadbeef",
            amount: 1,
            outcome: "1",
            limitPrice: "0.1",
            type: "sell_shares",
            marketOrderBook: {
                buy: [{
                    id: "0x123456789abcdef",
                    type: "buy",
                    market: "0xdeadbeef",
                    amount: "1",
                    price: "0.1",
                    owner: "0x0000000000000000000000000000000000001337",
                    block: 1117314,
                    outcome: "1"
                }],
                sell: []
            },
            positionsPerOutcome: {
                "1": {qtyShares: 1},
                "2": {qtyShares: 0}
            },
            onTradeSuccess: function (requestId, res) {
                requests[requestId].done();
                delete requests[requestId];
            }
        });

        // sell shares (have shares): partial match for existing buy order
        test({
            requestId: 7,
            market: "0xdeadbeef",
            amount: 1,
            outcome: "1",
            limitPrice: "0.5",
            type: "sell_shares",
            sharesNotSold: "0.5",
            marketOrderBook: {
                buy: [{
                    id: "0x123456789abcdef",
                    type: "buy",
                    market: "0xdeadbeef",
                    amount: "0.5",
                    price: "0.5",
                    owner: "0x0000000000000000000000000000000000001337",
                    block: 1117314,
                    outcome: "1"
                }],
                sell: []
            },
            positionsPerOutcome: {
                "1": {qtyShares: 1},
                "2": {qtyShares: 0}
            },
            onBuySellSuccess: function (requestId, res) {
                requests[requestId].buySell = true;
            },
            onTradeSuccess: function (requestId, res) {
                assert.isTrue(requests[requestId].buySell);
                requests[requestId].done();
                delete requests[requestId];
            }
        });

        // short sell (no matching buy order): buy complete set + create sell order
        test({
            requestId: 8,
            market: "0xdeadbeef",
            amount: 1,
            outcome: "1",
            limitPrice: "0.6",
            type: "sell_shares",
            marketOrderBook: {buy: [], sell: []},
            positionsPerOutcome: {
                "1": {qtyShares: 0},
                "2": {qtyShares: 0}
            },
            onBuyCompleteSetsSuccess: function (requestId, res) {
                requests[requestId].buyCompleteSets = true;
            },
            onBuySellSuccess: function (requestId, res) {
                assert.isTrue(requests[requestId].buyCompleteSets);
                requests[requestId].done();
                delete requests[requestId];
            }
        });

        // short sell (matching buy order): use short_sell method
        test({
            requestId: 9,
            market: "0xdeadbeef",
            amount: 1,
            outcome: "1",
            limitPrice: "0.6",
            type: "sell_shares",
            marketOrderBook: {
                buy: [{
                    id: "0x123456789abcdef",
                    type: "buy",
                    market: "0xdeadbeef",
                    amount: "1",
                    price: "0.6",
                    owner: "0x0000000000000000000000000000000000001337",
                    block: 1117314,
                    outcome: "1"
                }],
                sell: []
            },
            positionsPerOutcome: {
                "1": {qtyShares: 0},
                "2": {qtyShares: 0}
            },
            onTradeSuccess: function (requestId, res) {
                requests[requestId].done();
                delete requests[requestId];
            }
        });

        // short sell (2 matching buy orders): use short_sell method
        test({
            requestId: 10,
            market: "0xdeadbeef",
            amount: 1,
            outcome: "1",
            limitPrice: "0.6",
            type: "sell_shares",
            marketOrderBook: {
                buy: [{
                    id: "0x123456789abcdef",
                    type: "buy",
                    market: "0xdeadbeef",
                    amount: "0.6",
                    price: "0.6",
                    owner: "0x0000000000000000000000000000000000001337",
                    block: 1117314,
                    outcome: "1"
                }, {
                    id: "0x123456789abcdef0",
                    type: "buy",
                    market: "0xdeadbeef",
                    amount: "0.4",
                    price: "0.6",
                    owner: "0x0000000000000000000000000000000000001338",
                    block: 1117314,
                    outcome: "1"
                }],
                sell: []
            },
            positionsPerOutcome: {
                "1": {qtyShares: 0},
                "2": {qtyShares: 0}
            },
            onTradeSuccess: function (requestId, res) {
                if (!requests[requestId].shortSellCount) {
                    requests[requestId].shortSellCount = 1;
                } else {
                    requests[requestId].done();
                    delete requests[requestId];
                }
            }
        });
    });
});

describe("Integration tests", function () {

    if (process.env.AUGURJS_INTEGRATION_TESTS) {

        var augur = tools.setup(require("../../src"), process.argv.slice(2));
        var branchID = augur.branches.dev;
        var markets = augur.getMarketsInBranch(branchID);
        var password = fs.readFileSync(join(process.env.HOME, ".ethereum", ".password")).toString();
        var accounts = rpc.personal("listAccounts");
        
        describe("buy", function () {
            var test = function (t) {
                it(JSON.stringify(t), function (done) {
                    this.timeout(tools.TIMEOUT);
                    augur.get_total_trades(t.market, function (initialTotalTrades) {
                        initialTotalTrades = parseInt(initialTotalTrades);
                        rpc.personal("unlockAccount", [augur.from, password]);
                        augur.buy({
                            amount: t.amount,
                            price: t.price,
                            market: t.market,
                            outcome: t.outcome,
                            onSent: function (r) {
                                assert(r.txHash);
                                assert(r.callReturn);
                            },
                            onSuccess: function (r) {
                                augur.get_total_trades(t.market, function (totalTrades) {
                                    assert.strictEqual(parseInt(totalTrades), initialTotalTrades + 1);
                                    // rpc.personal("lockAccount", [augur.from]);
                                    done();
                                });
                            },
                            onFailed: done
                        });
                    });
                });
            };
            test({
                market: markets[markets.length - 1],
                amount: 1,
                price: "0.5",
                outcome: "1"
            });
            test({
                market: markets[markets.length - 1],
                amount: "0.25",
                price: "0.52",
                outcome: "1"
            });
        });

        describe("sell", function () {
            var test = function (t) {
                it(JSON.stringify(t), function (done) {
                    this.timeout(tools.TIMEOUT);
                    rpc.personal("unlockAccount", [augur.from, password]);
                    augur.buyCompleteSets({
                        market: t.market,
                        amount: t.amount,
                        onSent: function (r) {},
                        onSuccess: function (r) {
                            augur.get_total_trades(t.market, function (initialTotalTrades) {
                                initialTotalTrades = parseInt(initialTotalTrades);
                                augur.sell({
                                    amount: t.amount,
                                    price: t.price,
                                    market: t.market,
                                    outcome: t.outcome,
                                    onSent: function (r) {
                                        assert(r.txHash);
                                        assert(r.callReturn);
                                    },
                                    onSuccess: function (r) {
                                        augur.get_total_trades(t.market, function (totalTrades) {
                                            assert.strictEqual(parseInt(totalTrades), initialTotalTrades + 1);
                                            // rpc.personal("lockAccount", [augur.from]);
                                            done();
                                        });
                                    },
                                    onFailed: done
                                });
                            });
                        },
                        onFailed: done
                    });
                });
            };
            test({
                market: markets[markets.length - 1],
                amount: 1,
                price: "0.5",
                outcome: "1"
            });
            test({
                market: markets[markets.length - 1],
                amount: "0.25",
                price: "0.52",
                outcome: "1"
            });
        });

        describe("cancel", function () {
            var test = function (t) {
                it(JSON.stringify(t), function (done) {
                    this.timeout(tools.TIMEOUT);
                    rpc.personal("unlockAccount", [augur.from, password]);
                    augur.buyCompleteSets({
                        market: t.market,
                        amount: t.amount,
                        onSent: function (r) {},
                        onSuccess: function (r) {
                            augur.sell({
                                amount: t.amount,
                                price: t.price,
                                market: t.market,
                                outcome: t.outcome,
                                onSent: function (r) {
                                    assert(r.txHash);
                                    assert(r.callReturn);
                                },
                                onSuccess: function (r) {
                                    assert(r.txHash);
                                    assert(r.callReturn);
                                    augur.get_trade_ids(t.market, function (trade_ids) {
                                        augur.cancel(trade_ids[0], function (r) {
                                            assert(r.txHash);
                                            assert.strictEqual(r.callReturn, "1");
                                        }, function (r) {
                                            assert(r.txHash);
                                            assert.strictEqual(r.callReturn, "1");
                                            done();
                                        }, done);
                                    });
                                },
                                onFailed: done
                            });
                        },
                        onFailed: done
                    });
                });
            };
            test({
                market: markets[markets.length - 1],
                amount: 1,
                price: "0.5",
                outcome: "1"
            });
        });

        describe("trade", function () {
            var test = function (t) {
                it(JSON.stringify(t), function (done) {
                    this.timeout(tools.TIMEOUT*4);
                    // rpc.miner("start", 1);
                    rpc.personal("unlockAccount", [accounts[0], password]);
                    augur.from = accounts[0];
                    augur.connector.from_field_tx(accounts[0]);
                    augur.sync(augur.connector);
                    var initialTotalTrades = parseInt(augur.get_total_trades(t.market));
                    augur.buyCompleteSets({
                        market: t.market,
                        amount: 4,
                        onSent: function (r) {},
                        onSuccess: function (r) {
                            augur.sell({
                                amount: 1,
                                price: "0.01",
                                market: t.market,
                                outcome: t.outcome,
                                onSent: function (r) {},
                                onSuccess: function (r) {
                                    // rpc.miner("stop");
                                    augur.from = accounts[2];
                                    augur.connector.from_field_tx(accounts[2]);
                                    augur.sync(augur.connector);
                                    augur.get_trade_ids(t.market, function (trade_ids) {
                                        async.eachSeries(trade_ids, function (thisTrade, nextTrade) {
                                            augur.get_trade(thisTrade, function (tradeInfo) {
                                                if (!tradeInfo) return nextTrade("no trade info found");
                                                if (tradeInfo.owner === augur.from) return nextTrade();
                                                if (tradeInfo.type === "buy") return nextTrade();
                                                console.log("matched trade:", thisTrade, tradeInfo);
                                                // rpc.miner("start", 1);
                                                rpc.personal("unlockAccount", [accounts[2], password]);
                                                augur.trade({
                                                    max_value: t.max_value,
                                                    max_amount: 0,
                                                    trade_ids: [thisTrade],
                                                    onTradeHash: function (r) {
                                                        assert.notProperty(r, "error");
                                                        assert.isString(r);
                                                    },
                                                    onCommitSent: function (r) {
                                                        assert.strictEqual(r.callReturn, "1");
                                                    },
                                                    onCommitSuccess: function (r) {
                                                        assert.strictEqual(r.callReturn, "1");
                                                    },
                                                    onCommitFailed: nextTrade,
                                                    onTradeSent: function (r) {
                                                        console.log("trade sent:", r)
                                                        assert.isArray(r.callReturn);
                                                        assert.strictEqual(r.callReturn[0], 1);
                                                        assert.strictEqual(r.callReturn.length, 3);
                                                    },
                                                    onTradeSuccess: function (r) {
                                                        console.log("trade success:", r)
                                                        assert.isArray(r.callReturn);
                                                        assert.strictEqual(r.callReturn[0], 1);
                                                        assert.strictEqual(r.callReturn.length, 3);
                                                        var tradeIds = augur.get_trade_ids(t.market);
                                                        assert.strictEqual(tradeIds.indexOf(thisTrade), -1);
                                                        nextTrade(r);
                                                    },
                                                    onTradeFailed: nextTrade
                                                });
                                            });
                                        }, function (x) {
                                            if (x && x.callReturn) return done();
                                            done(x);
                                        });
                                    });
                                },
                                onFailed: done
                            });
                        },
                        onFailed: done
                    });
                });
            };
            test({
                market: markets[markets.length - 1],
                amount: 1,
                outcome: "1",
                max_value: 1
            });
        });

        describe("short_sell", function () {
            var test = function (t) {
                it(JSON.stringify(t), function (done) {
                    this.timeout(tools.TIMEOUT*4);
                    rpc.personal("unlockAccount", [accounts[0], password]);
                    augur.from = accounts[0];
                    augur.connector.from_field_tx(accounts[0]);
                    augur.sync(augur.connector);
                    var initialTotalTrades = parseInt(augur.get_total_trades(t.market));
                    augur.buy({
                        amount: 1,
                        price: "0.999",
                        market: t.market,
                        outcome: t.outcome,
                        onSent: function (r) {},
                        onSuccess: function (r) {
                            augur.from = accounts[2];
                            augur.connector.from_field_tx(accounts[2]);
                            augur.sync(augur.connector);
                            augur.get_trade_ids(t.market, function (trade_ids) {
                                async.eachSeries(trade_ids, function (thisTrade, nextTrade) {
                                    augur.get_trade(thisTrade, function (tradeInfo) {
                                        if (!tradeInfo) return nextTrade("no trade info found");
                                        if (tradeInfo.owner === augur.from) return nextTrade();
                                        if (tradeInfo.type === "sell") return nextTrade();
                                        console.log("matched trade:", thisTrade, tradeInfo);
                                        rpc.personal("unlockAccount", [accounts[2], password]);
                                        augur.short_sell({
                                            buyer_trade_id: thisTrade,
                                            max_amount: t.max_amount,
                                            onTradeHash: function (r) {
                                                assert.notProperty(r, "error");
                                                assert.isString(r);
                                            },
                                            onCommitSent: function (r) {
                                                assert.strictEqual(r.callReturn, "1");
                                            },
                                            onCommitSuccess: function (r) {
                                                assert.strictEqual(r.callReturn, "1");
                                            },
                                            onCommitFailed: nextTrade,
                                            onTradeSent: function (r) {
                                                console.log("trade sent:", r)
                                                assert.isArray(r.callReturn);
                                                assert.strictEqual(r.callReturn[0], 1);
                                                assert.strictEqual(r.callReturn.length, 4);
                                            },
                                            onTradeSuccess: function (r) {
                                                console.log("trade success:", r)
                                                assert.isArray(r.callReturn);
                                                assert.strictEqual(r.callReturn[0], 1);
                                                assert.strictEqual(r.callReturn.length, 4);
                                                nextTrade(r);
                                            },
                                            onTradeFailed: nextTrade
                                        });
                                    });
                                }, function (x) {
                                    if (x && x.callReturn) return done();
                                    done(x);
                                });
                            });
                        },
                        onFailed: done
                    });
                });
            };
            test({
                market: markets[markets.length - 1],
                amount: 1,
                outcome: "1",
                max_amount: 1
            });
        });

        describe("multiTrade", function () {
            var test = function (t) {
                it(JSON.stringify(t), function (done) {
                    this.timeout(tools.TIMEOUT*10);
                    rpc.personal("unlockAccount", [accounts[0], password]);
                    augur.from = accounts[0];
                    augur.connector.from_field_tx(accounts[0]);
                    augur.sync(augur.connector);
                    var orderBook = augur.getOrderBook(t.market);
                    var value = abi.bignum(t.amount).times(abi.bignum(t.limitPrice)).toFixed();
                    console.log("orderBook:", orderBook);
                    augur.multiTrade({
                        requestId: t.requestId,
                        market: t.market,
                        marketOrderBook: orderBook,
                        userTradeOrdersPerOutcome: [{
                            type: t.type,
                            shares: {value: t.amount},
                            ether: {value: value},
                            limitPrice: t.limitPrice,
                            data: {outcomeID: t.outcome}
                        }],
                        positionsPerOutcome: {"1": {qtyShares: 0}},
                        onTradeHash: function (tradeOrderId, tradeHash) {
                            // console.log("tradeHash:", tradeOrderId, tradeHash);
                        },
                        onCommitSent: function (tradeOrderId, res) {
                            // console.log("commitSent:", tradeOrderId, res);
                        },
                        onCommitFailed: function (tradeOrderId, err) {
                            // console.error("commit failed:", err);
                            done(new Error(JSON.stringify(err, null, 2)));
                        },
                        onNextBlock: function (tradeOrderId, block) {
                            // console.log("nextBlock:", tradeOrderId, block);
                        },
                        onTradeSent: function (tradeOrderId, res) {
                            // console.log("trade sent:", tradeOrderId, res);
                        },
                        onTradeSuccess: function (tradeOrderId, res) {
                            // console.log("tradeSuccess:", tradeOrderId, res);
                        },
                        onTradeFailed: function (tradeOrderId, err) {
                            console.error("trade failed:", err);
                            done(new Error(JSON.stringify(err, null, 2)));
                        },
                        onBuySellSent: function (requestId, res) {
                            // console.log("buySell sent:", requestId, res);
                        },
                        onBuySellSuccess: function (requestId, res) {
                            // console.log("buy/sell order placed on the books successfully!");
                            var newOrderBook = augur.getOrderBook(t.market);
                            var orderType = (t.type === "buy_shares") ? "buy" : "sell";
                            // console.log(newOrderBook[orderType]);
                            for (var i = 0, n = newOrderBook[orderType].length; i < n; ++i) {
                                // console.log("outcome:", t.outcome, newOrderBook[orderType][i].outcome);
                                // console.log("amount:", t.amount, parseInt(newOrderBook[orderType][i].amount));
                                // console.log("owner:", accounts[0], newOrderBook[orderType][i].owner);
                                // console.log("price:", Math.round(parseFloat(t.limitPrice)*1e6) / 1e6, Math.round(parseFloat(newOrderBook[orderType][i].price)*1e6) / 1e6);
                                if (t.outcome === newOrderBook[orderType][i].outcome &&
                                    t.amount === parseInt(newOrderBook[orderType][i].amount) &&
                                    accounts[0] === newOrderBook[orderType][i].owner) {
                                    // console.log("found order!", newOrderBook[orderType][i]);
                                    return done();
                                }
                            }
                            done(new Error("order not found :("));
                        },
                        onBuySellFailed: function (requestId, err) {
                            // console.error("buy/sell failed:", err);
                            done(new Error(JSON.stringify(err, null, 2)));
                        },
                        onBuyCompleteSetsSent: function (requestId, res) {

                        },
                        onBuyCompleteSetsSuccess: function (requestId, res) {

                        },
                        onBuyCompleteSetsFailed: function (requestId, err) {
                            // console.error("buyCompleteSets failed:", err);
                            done(new Error(JSON.stringify(err, null, 2)));
                        }
                    });
                });
            };

            // user wants to buy 1 share of outcome 1 @ limit price 0.6
            test({
                requestId: 1,
                market: markets[markets.length - 1],
                amount: 1,
                outcome: "1",
                limitPrice: "0.999",
                type: "buy_shares"
            });
        });
    }
});
