const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ORDERTYPE = { BUYANY: 0, SELLANY: 1, BUYALL: 2, SELLALL: 3 };
const ORDERTYPESTRING = [ "BuyAny", "SellAny", "BuyAll", "SellAll" ];
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

    this.verbose = false;
  }

  async init() {
    [this.deployerSigner, this.maker0Signer, this.maker1Signer, this.taker0Signer, this.taker1Signer] = await ethers.getSigners();
    [this.deployer, this.maker0, this.maker1, this.taker0, this.taker1] = await Promise.all([this.deployerSigner.getAddress(), this.maker0Signer.getAddress(), this.maker1Signer.getAddress(), this.taker0Signer.getAddress(), this.taker1Signer.getAddress()]);

    this.addAccount("0x0000000000000000000000000000000000000000", "null");
    this.addAccount(this.deployer, "deployer");
    this.addAccount(this.maker0, "maker0");
    this.addAccount(this.maker1, "maker1");
    this.addAccount(this.taker0, "taker0");
    this.addAccount(this.taker1, "taker1");
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
    console.log("      > " + prefix + " - gasUsed: " + receipt.gasUsed);
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
          console.log("        + " + this.getShortAccountName(log.address) + " " + log.blockNumber + "." + log.logIndex + " " + result);
          found = true;
        } catch (e) {
        }
      }
      if (!found) {
        console.log("      + " + this.getShortAccountName(log.address) + " " + JSON.stringify(log.topics));
      }
    });
    console.log();
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

  async printState(prefix) {
    if (this.nftA != null) {
      const totalSupply = await this.nftA.totalSupply();
      console.log("      --- " + prefix + " ---");
      const owners = {};
      for (let i = 0; i < totalSupply; i++) {
        const ownerOf = await this.nftA.ownerOf(i);
        if (!owners[ownerOf]) {
          owners[ownerOf] = [];
        }
        owners[ownerOf].push(i);
      }
      console.log("        Owner                            WETH " + await this.nftA.symbol() + " (totalSupply: " + totalSupply + ")");
      console.log("        ---------------- -------------------- -------------------------");
      var checkAccounts = [this.deployer, this.maker0, this.maker1, this.taker0, this.taker1];
      for (let i = 0; i < checkAccounts.length; i++) {
        const ownerData = owners[checkAccounts[i]] || [];
        const wethBalance = this.weth == null ? 0 : await this.weth.balanceOf(checkAccounts[i]);
        console.log("        " + this.padRight(this.getShortAccountName(checkAccounts[i]), 16) + " " + this.padLeft(ethers.utils.formatEther(wethBalance), 20) + " " + JSON.stringify(ownerData) + " ");
      }
      console.log();
    }

    if (this.nix != null) {
      const ordersLength = await this.nix.ordersLength();
      if (ordersLength > 0) {
        console.log("          # Maker         Taker        Token                       Price OrderType       Expiry                   Tx Count   Tx Max   Status Key        TokenIds");
        console.log("        --- ------------- ------------ ------------ -------------------- --------------- ------------------------ -------- -------- -------- ---------- -----------------------");
        const orderIndices = [];
        for (let i = 0; i < ordersLength; i++) {
          orderIndices.push(i);
        }
        const orders = await this.nix.getOrders(orderIndices);
        for (let i = 0; i < ordersLength; i++) {
          const orderKey = orders[0][i];
          const maker = orders[1][i];
          const taker = orders[2][i];
          const token = orders[3][i];
          const tokenIds = orders[4][i];
          const price = orders[5][i];
          const data = orders[6][i];
          const orderType = data[0];
          const expiry = data[1];
          const expiryString = expiry == 0 ? "(none)" : new Date(expiry * 1000).toISOString();
          const tradeCount = data[2];
          const tradeMax = data[3];
          const orderStatus = data[4];
          console.log("        " + this.padLeft(i, 3) + " " + this.padRight(this.getShortAccountName(maker), 12) + " " +
            this.padRight(this.getShortAccountName(taker), 12) + " " + this.padRight(this.getShortAccountName(token), 12) + " " +
            this.padLeft(ethers.utils.formatEther(price), 20) + " " + this.padRight(ORDERTYPESTRING[orderType], 15) + " " +
            this.padRight(expiryString, 24) + " " +
            this.padLeft(tradeCount.toString(), 8) + " " +
            this.padLeft(tradeMax.toString(), 8) + " " +
            this.padLeft(orderStatus.toString(), 8) + " " +
            orderKey.substring(0, 10) + " " +
            JSON.stringify(tokenIds.map((x) => { return parseInt(x.toString()); })));
        }
      }
      console.log();
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
