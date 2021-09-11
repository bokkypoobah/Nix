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
    console.log("      Mapping " + account + " => " + this.getShortAccountName(account));
  }
  getShortAccountName(address) {
    if (address == ZERO_ADDRESS) {
      return "ETH|null:" + ZERO_ADDRESS.substring(0, 6);
    }
    if (address != null) {
      var a = address.toLowerCase();
      var n = this.accountNames[a];
      if (n !== undefined) {
        return n + ":" + address.substring(0, 6);
      }
    }
    return address;
  }

}

/* Exporting the module */
module.exports = {
    ZERO_ADDRESS,
    ORDERTYPE,
    ORDERTYPESTRING,
    Data
}
