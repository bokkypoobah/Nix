const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const BUYORSELL = { BUY: 0, SELL: 1 };
const ANYORALL = { ANY: 0, ALL: 1 };
const BUYORSELLSTRING = [ "Buy", "Sell" ];
const ANYORALLSTRING = [ "Any", "All" ];
const ORDERSTATUSSTRING = [ "Executable", "Disabled", "Expired", "Maxxed", "MakerNoWeth", "MakerNoWethAllowance", "MakerNoToken", "MakerNotApprovedNix", "UnknownError" ];

const { BigNumber } = require("ethers");
const util = require('util');
const { expect, assert } = require("chai");

class Data {

  constructor() {
    this.accounts = [];
    this.accountNames = {};
    this.contracts = [];

    this.weth = null;
    this.royaltyEngine = null;
    this.nftA = null;
    this.nftB = null;
    this.nix = null;
    this.nixHelper = null;

    this.gasPrice = ethers.utils.parseUnits("84", "gwei");
    this.ethUsd = ethers.utils.parseUnits("3730.93", 18);

    this.verbose = false;
  }

  async init() {
    [this.deployerSigner, this.maker0Signer, this.maker1Signer, this.taker0Signer, this.taker1Signer, this.royalty1Signer, this.royalty2Signer, this.integratorSigner] = await ethers.getSigners();
    [this.deployer, this.maker0, this.maker1, this.taker0, this.taker1, this.royalty1, this.royalty2, this.integrator] = await Promise.all([this.deployerSigner.getAddress(), this.maker0Signer.getAddress(), this.maker1Signer.getAddress(), this.taker0Signer.getAddress(), this.taker1Signer.getAddress(), this.royalty1Signer.getAddress(), this.royalty2Signer.getAddress(), this.integratorSigner.getAddress()]);

    this.addAccount("0x0000000000000000000000000000000000000000", "null");
    this.addAccount(this.deployer, "deployer");
    this.addAccount(this.maker0, "maker0");
    this.addAccount(this.maker1, "maker1");
    this.addAccount(this.taker0, "taker0");
    this.addAccount(this.taker1, "taker1");
    this.addAccount(this.royalty1, "royalty1");
    this.addAccount(this.royalty2, "royalty2");
    this.addAccount(this.integrator, "integrator");
    this.baseBlock = await ethers.provider.getBlockNumber();
  }

  addAccount(account, accountName) {
    this.accounts.push(account);
    this.accountNames[account.toLowerCase()] = accountName;
    if (this.verbose) {
      console.log("      Mapping account " + account + " => " + this.getShortAccountName(account));
    }
  }
  getShortAccountName(address) {
    if (address != null) {
      var a = address.toLowerCase();
      var n = this.accountNames[a];
      if (n !== undefined) {
        return n + ":" + address.substring(0, 6);
      }
    }
    return address;
  }
  addContract(contract, contractName) {
    const address = contract.address;
    this.accounts.push(address);
    this.accountNames[address.toLowerCase()] = contractName;
    this.contracts.push(contract);
    if (this.verbose) {
      console.log("      Mapping contract " + address + " => " + this.getShortAccountName(address));
    }
  }


  printEvents(prefix, receipt) {
    var fee = receipt.gasUsed.mul(this.gasPrice);
    var feeUsd = fee.mul(this.ethUsd).div(ethers.utils.parseUnits("1", 18)).div(ethers.utils.parseUnits("1", 18));
    console.log("        > " + prefix + " - gasUsed: " + receipt.gasUsed + " ~ ETH " + ethers.utils.formatEther(fee) + " ~ USD " + feeUsd);
    receipt.logs.forEach((log) => {
      let found = false;
      for (let i = 0; i < this.contracts.length && !found; i++) {
        try {
          var data = this.contracts[i].interface.parseLog(log);
          var result = data.name + "(";
          let separator = "";
          data.eventFragment.inputs.forEach((a) => {
            result = result + separator + a.name + ": ";
            if (a.type == 'address') {
              result = result + this.getShortAccountName(data.args[a.name].toString());
            } else if (a.type == 'uint256' || a.type == 'uint128') {
              if (a.name == 'tokens' || a.name == 'amount' || a.name == 'balance' || a.name == 'value' || a.name == 'tip') {
                result = result + ethers.utils.formatUnits(data.args[a.name], 18);
              } else {
                result = result + data.args[a.name].toString();
              }
            } else {
              result = result + data.args[a.name].toString();
            }
            separator = ", ";
          });
          result = result + ")";
          console.log("          + " + this.getShortAccountName(log.address) + " " + log.blockNumber + "." + log.logIndex + " " + result);
          found = true;
        } catch (e) {
        }
      }
      if (!found) {
        console.log("        + " + this.getShortAccountName(log.address) + " " + JSON.stringify(log.topics));
      }
    });
  }

  padLeft(s, n) {
    var o = s.toString();
    while (o.length < n) {
      o = " " + o;
    }
    return o;
  }
  padLeft0(s, n) {
    var result = s.toString();
    while (result.length < n) {
      result = "0" + result;
    }
    return result;
  }
  padRight(s, n) {
    var o = s;
    while (o.length < n) {
      o = o + " ";
    }
    return o;
  }

  async setWeth(weth) {
    this.weth = weth;
    this.addContract(weth, "WETH");
  }
  async setRoyaltyEngine(royaltyEngine) {
    this.royaltyEngine = royaltyEngine;
    this.addContract(royaltyEngine, "RoyaltyEngine");
  }
  async setNFTA(nftA) {
    this.nftA = nftA;
    this.addContract(nftA, "NFTA");
  }
  async setNFTB(nftB) {
    this.nftB = nftB;
    this.addContract(nftB, "NFTB");
  }
  async setNix(nix) {
    this.nix = nix;
    this.addContract(nix, "Nix");
  }
  async setNixHelper(nixHelper) {
    this.nixHelper = nixHelper;
    this.addContract(nixHelper, "NixHelper");
  }

  async printState(prefix) {
    console.log("        --- " + prefix + " ---");
    let totalSupplyA = 0;
    let totalSupplyB = 0;
    const ownersA = {};
    const ownersB = {};
    if (this.nftA != null) {
      totalSupplyA = await this.nftA.totalSupply();
      for (let i = 0; i < totalSupplyA; i++) {
        const ownerOf = await this.nftA.ownerOf(i);
        if (!ownersA[ownerOf]) {
          ownersA[ownerOf] = [];
        }
        ownersA[ownerOf].push(i);
      }
    }
    if (this.nftB != null) {
      totalSupplyB = await this.nftB.totalSupply();
      for (let i = 0; i < totalSupplyB; i++) {
        const ownerOf = await this.nftB.ownerOf(i);
        if (!ownersB[ownerOf]) {
          ownersB[ownerOf] = [];
        }
        ownersB[ownerOf].push(i);
      }
    }
    console.log("          Account                               ETH                 WETH " + this.padRight(await this.nftA.symbol() + " (" + totalSupplyA + ")", 26) + this.padRight(await this.nftB.symbol() + " (" + totalSupplyB + ")", 26) );
    console.log("          -------------------- -------------------- -------------------- ------------------------- -------------------------");
    const checkAccounts = [this.deployer, this.maker0, this.maker1, this.taker0, this.taker1, this.royalty1, this.royalty2, this.integrator];
    if (this.nix != null) {
      checkAccounts.push(this.nix.address);
    }
    if (this.nixHelper != null) {
      checkAccounts.push(this.nixHelper.address);
    }
    for (let i = 0; i < checkAccounts.length; i++) {
      const ownerDataA = ownersA[checkAccounts[i]] || [];
      const ownerDataB = ownersB[checkAccounts[i]] || [];
      const balance = await ethers.provider.getBalance(checkAccounts[i]);
      const wethBalance = this.weth == null ? 0 : await this.weth.balanceOf(checkAccounts[i]);
      console.log("          " + this.padRight(this.getShortAccountName(checkAccounts[i]), 20) + " " + this.padLeft(ethers.utils.formatEther(balance), 20) + " " + this.padLeft(ethers.utils.formatEther(wethBalance), 20) + " " + this.padRight(JSON.stringify(ownerDataA), 25) + " " + JSON.stringify(ownerDataB));
    }
    console.log();

    if (this.nix != null) {
      const tokensLength = (await this.nix.getLengths())[0];
      if (tokensLength > 0) {
        var tokensIndices = [...Array(parseInt(tokensLength)).keys()];
        const tokens = await this.nixHelper.getTokens(tokensIndices);
        for (let i = 0; i < tokens[0].length; i++) {
          const token = tokens[0][i];
          const ordersLength = tokens[1][i];
          const executed = tokens[2][i];
          const volumeToken = tokens[3][i];
          const volumeWeth = tokens[4][i];
          console.log("          Orders for " + this.getShortAccountName(token) + ", ordersLength: " + ordersLength + ", executed: " + executed + ", volumeToken: " + volumeToken + ", volumeWeth: " + ethers.utils.formatEther(volumeWeth));
          console.log("              # Maker          Taker                         Price B/S  Any/All Expiry                   Tx Count   Tx Max  RoyFac% Status               TokenIds");
          console.log("            --- -------------- -------------- -------------------- ---- ------- ------------------------ -------- -------- -------- -------------------- -----------------------");
          var orderIndices = [...Array(parseInt(ordersLength)).keys()];
          const orders = await this.nixHelper.getOrders(token, orderIndices);
          for (let i = 0; i < ordersLength; i++) {
            const maker = orders[0][i];
            const taker = orders[1][i];
            const tokenIds = orders[2][i];
            const price = orders[3][i];
            const data = orders[4][i];
            const buyOrSell = data[0];
            const anyOrAll = data[1];
            const expiry = data[2];
            const expiryString = expiry == 0 ? "(none)" : new Date(expiry * 1000).toISOString();
            const tradeCount = data[3];
            const tradeMax = data[4];
            const royaltyFactor = data[5];
            const orderStatus = data[6];
            const orderStatusString = ORDERSTATUSSTRING[orderStatus];
            console.log("            " + this.padLeft(i, 3) + " " +
              this.padRight(this.getShortAccountName(maker), 14) + " " +
              this.padRight(this.getShortAccountName(taker), 14) + " " +
              this.padLeft(ethers.utils.formatEther(price), 20) + " " +
              this.padRight(BUYORSELLSTRING[buyOrSell], 4) + " " +
              this.padRight(ANYORALLSTRING[anyOrAll], 7) + " " +
              this.padRight(expiryString, 24) + " " +
              this.padLeft(tradeCount.toString(), 8) + " " +
              this.padLeft(tradeMax.toString(), 8) + " " +
              this.padLeft(royaltyFactor.toString(), 8) + " " +
              this.padRight(orderStatusString.toString(), 20) + " " +
              JSON.stringify(tokenIds.map((x) => { return parseInt(x.toString()); })));
          }
          console.log();
        }
      }
    }

    const tradesLength = (await this.nix.getLengths())[1];
    if (tradesLength > 0) {
      console.log("          tradesLength: " + tradesLength);
      // if (ordersLength > 0) {
      //   console.log("            # Maker         Taker        Token                       Price Type     Expiry                   Tx Count   Tx Max Status               Key        TokenIds");
      //   console.log("          --- ------------- ------------ ------------ -------------------- -------- ------------------------ -------- -------- -------------------- ---------- -----------------------");
      const tradeIndices = [...Array(parseInt(tradesLength)).keys()];
      const trades = await this.nixHelper.getTrades(tradeIndices);
      console.log("          trades: " + JSON.stringify(trades.map((x) => { return x.toString(); })));
      // //   const orders = await this.nix.getOrders(tradeIndices);
      //
      //
      //   for (let i = 0; i < tradesLength; i++) {
      //     console.log("trade: " + JSON.stringify(trade));
      //   }
      // }
    }
  }
}

/* Exporting the module */
module.exports = {
    ZERO_ADDRESS,
    BUYORSELL,
    ANYORALL,
    BUYORSELLSTRING,
    ANYORALLSTRING,
    Data
}
