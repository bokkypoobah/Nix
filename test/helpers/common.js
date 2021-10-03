const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ORDERTYPE = { BUYANY: 0, SELLANY: 1, BUYALL: 2, SELLALL: 3 };
const ORDERTYPESTRING = [ "BuyAny", "SellAny", "BuyAll", "SellAll" ];
const ORDERSTATUSSTRING = [ "Executable", "Expired", "Maxxed", "MakerNoWeth", "MakerNoWethAllowance", "MakerNoToken", "MakerNotApprovedNix", "UnknownError" ];

const { BigNumber } = require("ethers");
const util = require('util');
const { expect, assert } = require("chai");

class Data {

  constructor() {
    this.accounts = [];
    this.accountNames = {};
    this.contracts = [];

    this.weth = null;
    this.nftA = null;
    this.nix = null;
    this.nixHelper = null;

    this.gasPrice = ethers.utils.parseUnits("84", "gwei");
    this.ethUsd = ethers.utils.parseUnits("3233.35", 18);

    this.verbose = false;
  }

  async init() {
    [this.deployerSigner, this.maker0Signer, this.maker1Signer, this.taker0Signer, this.taker1Signer, this.integratorSigner] = await ethers.getSigners();
    [this.deployer, this.maker0, this.maker1, this.taker0, this.taker1, this.integrator] = await Promise.all([this.deployerSigner.getAddress(), this.maker0Signer.getAddress(), this.maker1Signer.getAddress(), this.taker0Signer.getAddress(), this.taker1Signer.getAddress(), this.integratorSigner.getAddress()]);

    this.addAccount("0x0000000000000000000000000000000000000000", "null");
    this.addAccount(this.deployer, "deployer");
    this.addAccount(this.maker0, "maker0");
    this.addAccount(this.maker1, "maker1");
    this.addAccount(this.taker0, "taker0");
    this.addAccount(this.taker1, "taker1");
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
              if (a.name == 'tokens' || a.name == 'amount' || a.name == 'balance' || a.name == 'value') {
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
  async setNFTA(nftA) {
    this.nftA = nftA;
    this.addContract(nftA, "NFTA");
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
    if (this.nftA != null) {
      const totalSupply = await this.nftA.totalSupply();
      console.log("        --- " + prefix + " ---");
      const owners = {};
      for (let i = 0; i < totalSupply; i++) {
        const ownerOf = await this.nftA.ownerOf(i);
        if (!owners[ownerOf]) {
          owners[ownerOf] = [];
        }
        owners[ownerOf].push(i);
      }
      console.log("          Account                               ETH                 WETH " + await this.nftA.symbol() + " (totalSupply: " + totalSupply + ")");
      console.log("          -------------------- -------------------- -------------------- -------------------------");
      const checkAccounts = [this.deployer, this.maker0, this.maker1, this.taker0, this.taker1, this.integrator];
      if (this.nix != null) {
        checkAccounts.push(this.nix.address);
      }
      if (this.nixHelper != null) {
        checkAccounts.push(this.nixHelper.address);
      }
      for (let i = 0; i < checkAccounts.length; i++) {
        const ownerData = owners[checkAccounts[i]] || [];
        const balance = await ethers.provider.getBalance(checkAccounts[i]);
        const wethBalance = this.weth == null ? 0 : await this.weth.balanceOf(checkAccounts[i]);
        console.log("          " + this.padRight(this.getShortAccountName(checkAccounts[i]), 20) + " " + this.padLeft(ethers.utils.formatEther(balance), 20) + " " + this.padLeft(ethers.utils.formatEther(wethBalance), 20) + " " + JSON.stringify(ownerData) + " ");
      }
      console.log();
    }

    if (this.nix != null) {

      const tokenInfosLength = await this.nix.tokenInfosLength();
      console.log("tokenInfosLength: " + tokenInfosLength);
      if (tokenInfosLength > 0) {
        var tokenInfosIndices = [...Array(parseInt(tokenInfosLength)).keys()];
        console.log("tokenInfosIndices: " + JSON.stringify(tokenInfosIndices));
        const tokenInfos = await this.nixHelper.getTokenInfos(tokenInfosIndices);
        console.log("tokenInfos: " + JSON.stringify(tokenInfos.map((x) => { return x.toString(); })));
      }

      const ordersLength = await this.nix.ordersLength(this.nftA.address);
      if (ordersLength > 0) {
        console.log("          Token          # Maker          Taker                         Price Type     Expiry                   Tx Count   Tx Max Status               Key        TokenIds");
        console.log("          ------------ --- -------------- -------------- -------------------- -------- ------------------------ -------- -------- -------------------- ---------- -----------------------");
        var orderIndices = [...Array(parseInt(ordersLength)).keys()];
        const orders = await this.nixHelper.getOrders(this.nftA.address, orderIndices);
        const token = this.nftA.address;
        for (let i = 0; i < ordersLength; i++) {
          const orderKey = orders[0][i];
          const maker = orders[1][i];
          const taker = orders[2][i];
          // const token = orders[3][i];
          const tokenIds = orders[3][i];
          const price = orders[4][i];
          const data = orders[5][i];
          const orderType = data[0];
          const expiry = data[1];
          const expiryString = expiry == 0 ? "(none)" : new Date(expiry * 1000).toISOString();
          const tradeCount = data[2];
          const tradeMax = data[3];
          const orderStatus = data[4];
          const orderStatusString = ORDERSTATUSSTRING[orderStatus];
          console.log("          " + this.padRight(this.getShortAccountName(token), 12) + " " + this.padLeft(i, 3) + " " +
            this.padRight(this.getShortAccountName(maker), 14) + " " +
            this.padRight(this.getShortAccountName(taker), 14) + " " +
            this.padLeft(ethers.utils.formatEther(price), 20) + " " + this.padRight(ORDERTYPESTRING[orderType], 8) + " " +
            this.padRight(expiryString, 24) + " " +
            this.padLeft(tradeCount.toString(), 8) + " " +
            this.padLeft(tradeMax.toString(), 8) + " " +
            this.padRight(orderStatusString.toString(), 20) + " " +
            orderKey.substring(0, 10) + " " +
            JSON.stringify(tokenIds.map((x) => { return parseInt(x.toString()); })));
        }
      }
      console.log();
    }

    const tradesLength = await this.nix.tradesLength();
    if (tradesLength > 0) {
      console.log("tradesLength: " + tradesLength);
      // if (ordersLength > 0) {
      //   console.log("            # Maker         Taker        Token                       Price Type     Expiry                   Tx Count   Tx Max Status               Key        TokenIds");
      //   console.log("          --- ------------- ------------ ------------ -------------------- -------- ------------------------ -------- -------- -------------------- ---------- -----------------------");
      const tradeIndices = [];
      for (let i = 0; i < tradesLength; i++) {
        tradeIndices.push(i);
      }
      const trades = await this.nixHelper.getTrades(tradeIndices);
      console.log("trades: " + JSON.stringify(trades.map((x) => { return x.toString(); })));
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
    ORDERTYPE,
    ORDERTYPESTRING,
    Data
}
