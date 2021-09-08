const { singletons, expectRevert } = require("@openzeppelin/test-helpers");
const { expect, assert } = require("chai");
const { BigNumber } = require("ethers");
const util = require('util');

describe("Nix", function () {
  const NULLACCOUNT = "0x0000000000000000000000000000000000000000";
  let owner, user0, user1, ownerSigner, user0Signer, user1Signer, erc1820Registry, simpleERC721, nft1, nix;
  const accounts = [];
  const accountNames = {};
  const contracts = [];

  function addAccount(account, accountName) {
    accounts.push(account);
    accountNames[account.toLowerCase()] = accountName;
    console.log("      Mapping " + account + " => " + getShortAccountName(account));
  }

  function getShortAccountName(address) {
    if (address != null) {
      var a = address.toLowerCase();
      var n = accountNames[a];
      if (n !== undefined) {
        return n + ":" + address.substring(0, 6);
      }
    }
    return address;
  }

  function printEvents(prefix, receipt) {
    console.log("      > " + prefix + " - gasUsed: " + receipt.gasUsed);
    receipt.logs.forEach((log) => {
      let found = false;
      for (let i = 0; i < contracts.length && !found; i++) {
        try {
          var data = contracts[i].interface.parseLog(log);
          var result = data.name + "(";
          let separator = "";
          data.eventFragment.inputs.forEach((a) => {
            result = result + separator + a.name + ": ";
            if (a.type == 'address') {
              result = result + getShortAccountName(data.args[a.name].toString());
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
          console.log("        + " + getShortAccountName(log.address) + " " + log.blockNumber + "." + log.logIndex + " " + result);
          found = true;
        } catch (e) {
        }
      }
      if (!found) {
        console.log("      + " + getShortAccountName(log.address) + " " + JSON.stringify(log.topics));
      }
    });
  }

  function padLeft(s, n) {
    var o = s;
    while (o.length < n) {
      o = " " + o;
    }
    return o;
  }
  function padRight(s, n) {
    var o = s;
    while (o.length < n) {
      o = o + " ";
    }
    return o;
  }

  async function printERC721Details(prefix) {
    const totalSupply = await nft1.totalSupply();
    console.log("      --- " + prefix + " - ERC721 '" + await nft1.name() + "' '" + await nft1.symbol() + "' " + totalSupply + " ---");
    for (let i = 0; i < totalSupply; i++) {
      const ownerOf = await nft1.ownerOf(i);
      console.log("          " + i + " " + getShortAccountName(ownerOf));
    }
  }

  async function printNixDetails(prefix) {
    const orderTypes = [ "SellAll", "SellAnySingle", "SellAnyMultiple", "BuyAll", "BuyAnySingle", "BuyAnyMultiple" ];
    const orderStatuses = [ "Active", "Cancelled", "Executed", "NotExecutable" ];

    const ordersLength = await nix.ordersLength();
    console.log("    --- " + prefix + " - Nix - orders: " + ordersLength + " ---");
    console.log("           # Maker        Taker        Token                        WETH OrderType       Expiry                   Order Status TokenIds");
    for (let i = 0; i < ordersLength; i++) {
      const order = await nix.getOrderByIndex(i);

      const maker = order[0];
      const taker = order[1];
      const token = order[2];
      const tokenIds = order[3];
      const weth = order[4];
      const orderType = order[5];
      const expiry = order[6];
      const expiryString = expiry == 0 ? "(none)" : new Date(expiry * 1000).toISOString();
      const orderStatus = order[7];

      console.log("           " + padLeft(i, 3) + " " + padRight(getShortAccountName(maker), 12) + " " +
        padRight(getShortAccountName(taker), 12) + " " + padRight(getShortAccountName(token), 12) + " " +
        padLeft(ethers.utils.formatEther(weth), 20) + " " + padRight(orderTypes[orderType], 15) + " " +
        padRight(expiryString, 24) + " " +
        padRight(orderStatuses[orderStatus], 12) + " " +
        JSON.stringify(tokenIds.map((x) => { return parseInt(x.toString()); })));
      // for (let j = 0; j < tokenIds.length; j++) {
      //   console.log("          - " + j + ". tokenId: " + tokenIds[j]);
      // }
      // console.log("        " + i + " " + JSON.stringify(order));
    }
  }


  before(async function () {
    [owner, user0, user1] = await web3.eth.getAccounts();
    [ownerSigner, user0Signer, user1Signer] = await ethers.getSigners();

    console.log("    --- Setup Accounts ---");
    addAccount("0x0000000000000000000000000000000000000000", "null");
    addAccount(owner, "owner");
    addAccount(user0, "user0");
    addAccount(user1, "user1");

    erc1820Registry = await singletons.ERC1820Registry(owner);
    addAccount(erc1820Registry.address, "ERC1820Registry");

    const ERC721PresetMinterPauserAutoId  = await ethers.getContractFactory("ERC721PresetMinterPauserAutoId");
    nft1 = await ERC721PresetMinterPauserAutoId.deploy("name", "symbol", "uri");
    contracts.push(nft1);
    addAccount(nft1.address, "NFT1");
    const nft1TransactionReceipt = await nft1.deployTransaction.wait();
    printEvents("Deployed NFT1", nft1TransactionReceipt);

    const mint0Tx = await nft1.mint(owner);
    printEvents("Minted NFT1", await mint0Tx.wait());
    const mint1Tx = await nft1.mint(user0);
    printEvents("Minted NFT1", await mint1Tx.wait());
    const mint2Tx = await nft1.mint(user0);
    printEvents("Minted NFT1", await mint2Tx.wait());
    const mint3Tx = await nft1.mint(user0);
    printEvents("Minted NFT1", await mint3Tx.wait());
    await printERC721Details("NFT Setup Completed");

    const Nix = await ethers.getContractFactory("Nix");
    nix = await Nix.deploy("Hello, world!");
    await nix.deployed();
    contracts.push(nix);
    addAccount(nix.address, "Nix");
    await printNixDetails("Nix Deployed");
  })


  it("Should return the new greeting once it's changed", async function () {

    const approveTx = await nft1.connect(user0Signer).setApprovalForAll(nix.address, true);
    printEvents("Approved Nix To Transfer", await approveTx.wait());
    await printERC721Details("After Maker Approve Nix To Transfer");
    console.log();

    const makerAddOrder1Tx = await nix.connect(user0Signer).makerAddOrder(
      NULLACCOUNT, // taker
      nft1.address, // token
      [ 1 ], // tokenIds
      ethers.utils.parseEther("12.3456"), // weth
      0, // orderType
      0, // expiry
    );
    printEvents("Maker Added Order #0 - Sell NFT1:1 for 12.3456e", await makerAddOrder1Tx.wait());
    await printNixDetails("After Approve And Maker Added Order #0");
    console.log();

    const expiry2 = parseInt(new Date() / 1000) + (60 * 60 * 24);
    const makerAddOrder2Tx = await nix.connect(user0Signer).makerAddOrder(
      NULLACCOUNT, // taker
      nft1.address, // token
      [ ], // tokenIds
      ethers.utils.parseEther("1.23456"), // weth
      0, // orderType
      expiry2, // expiry
    );
    printEvents("Maker Added Order #1 - Sell NFT1:* for 1.23456e", await makerAddOrder2Tx.wait());
    await printNixDetails("After Approve And Maker Added Order #1");

    if (false) {
      const exchangeTx = await nix.connect(user0Signer).exchange(nft1.address, 1, user1);
      printEvents("Exchanged", await exchangeTx.wait());
      await printERC721Details("After Approve And Exchange =");
    }

    // expect(await nix.greet()).to.equal("Hello, world!");
    //
    // const setGreetingTx = await nix.setGreeting("Hola, mundo!");
    //
    // // wait until the transaction is mined
    // await setGreetingTx.wait();
    //
    // expect(await nix.greet()).to.equal("Hola, mundo!");
  });
});
