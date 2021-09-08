const { singletons, expectRevert } = require("@openzeppelin/test-helpers");
const { expect, assert } = require("chai");
const { BigNumber } = require("ethers");
const util = require('util');

describe("Nix", function () {
  const NULLACCOUNT = "0x0000000000000000000000000000000000000000";
  const orderTypes = [ "BuyAny", "SellAny", "BuyAll", "SellAll" ];
  const ORDERTYPE_BUYANY = 0;
  const ORDERTYPE_SELLANY = 1;
  const ORDERTYPE_BUYALL = 2;
  const ORDERTYPE_SELLALL = 3;
  const orderStatuses = [ "Active", "Cancelled", "Executed", "NotExecutable" ];

  let owner, maker0, maker1, taker0, taker1, ownerSigner, maker0Signer, maker1Signer, taker0Signer, taker1Signer, erc1820Registry, simpleERC721, nftA, weth, nix;
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

  async function printBalances(prefix) {
    const totalSupply = await nftA.totalSupply();
    console.log("      --- " + prefix + " - ERC721 '" + await nftA.name() + "' '" + await nftA.symbol() + "' " + totalSupply + " ---");
    const owners = {};
    for (let i = 0; i < totalSupply; i++) {
      const ownerOf = await nftA.ownerOf(i);
      if (!owners[ownerOf]) {
        owners[ownerOf] = [];
      }
      owners[ownerOf].push(i);
    }
    console.log("        Owner                            WETH NFTA");
    var checkAccounts = [owner, maker0, maker1, taker0, taker1];
    for (let i = 0; i < checkAccounts.length; i++) {
      const ownerData = owners[checkAccounts[i]] || [];
      const wethBalance = weth == null ? 0 : await weth.balanceOf(checkAccounts[i]);
      console.log("        " + padRight(getShortAccountName(checkAccounts[i]), 16) + " " + padLeft(ethers.utils.formatEther(wethBalance), 20) + " " + JSON.stringify(ownerData) + " ");
    }
  }

  async function printNixDetails(prefix) {
    const ordersLength = await nix.ordersLength();
    console.log("    --- " + prefix + " - Nix - orders: " + ordersLength + " ---");
    console.log("           # Maker        Taker        Token                        WETH OrderType       Expiry                   Order Status Key        TokenIds");
    for (let i = 0; i < ordersLength; i++) {
      const order = await nix.getOrderByIndex(i);

      // console.log("        " + i + " " + JSON.stringify(order));
      const maker = order[0][0];
      const taker = order[0][1];
      const token = order[0][2];
      const tokenIds = order[0][3];
      const weth = order[0][4];
      const orderType = order[0][5];
      const expiry = order[0][6];
      const expiryString = expiry == 0 ? "(none)" : new Date(expiry * 1000).toISOString();
      const orderStatus = order[0][7];
      const orderKey = order[1];

      console.log("           " + padLeft(i, 3) + " " + padRight(getShortAccountName(maker), 12) + " " +
        padRight(getShortAccountName(taker), 12) + " " + padRight(getShortAccountName(token), 12) + " " +
        padLeft(ethers.utils.formatEther(weth), 20) + " " + padRight(orderTypes[orderType], 15) + " " +
        padRight(expiryString, 24) + " " +
        padRight(orderStatuses[orderStatus], 12) + " " +
        orderKey.substring(0, 10) + " " +
        JSON.stringify(tokenIds.map((x) => { return parseInt(x.toString()); })));
    }
  }


  before(async function () {
    [owner, maker0, maker1, taker0, taker1] = await web3.eth.getAccounts();
    [ownerSigner, maker0Signer, maker1Signer, taker0Signer, taker1Signer] = await ethers.getSigners();

    console.log("    --- Setup Accounts ---");
    addAccount("0x0000000000000000000000000000000000000000", "null");
    addAccount(owner, "owner");
    addAccount(maker0, "maker0");
    addAccount(maker1, "maker1");
    addAccount(taker0, "taker0");
    addAccount(taker1, "taker1");

    erc1820Registry = await singletons.ERC1820Registry(owner);
    addAccount(erc1820Registry.address, "ERC1820Registry");

    const TestERC20 = await ethers.getContractFactory("TestERC20");
    const fixedSupply = ethers.utils.parseEther("500");
    weth = await TestERC20.deploy("WETH", "Wrapped ETH", 18, fixedSupply);
    await weth.deployed();
    contracts.push(weth);
    addAccount(weth.address, "WETH");
    const transferWeth0Tx = await weth.transfer(maker0, ethers.utils.parseEther("100"));
    await printEvents("Transfer WETH", await transferWeth0Tx.wait());
    const transferWeth1Tx = await weth.transfer(maker1, ethers.utils.parseEther("100"));
    await printEvents("Transfer WETH", await transferWeth1Tx.wait());
    const transferWeth2Tx = await weth.transfer(taker0, ethers.utils.parseEther("100"));
    await printEvents("Transfer WETH", await transferWeth2Tx.wait());
    const transferWeth3Tx = await weth.transfer(taker1, ethers.utils.parseEther("100"));
    await printEvents("Transfer WETH", await transferWeth3Tx.wait());

    const ERC721PresetMinterPauserAutoId  = await ethers.getContractFactory("ERC721PresetMinterPauserAutoId");
    nftA = await ERC721PresetMinterPauserAutoId.deploy("name", "symbol", "uri");
    contracts.push(nftA);
    addAccount(nftA.address, "NFT1");
    const nftATransactionReceipt = await nftA.deployTransaction.wait();
    await printEvents("Deployed NFT1", nftATransactionReceipt);

    const mint0Tx = await nftA.mint(maker0);
    await printEvents("Minted NFT1", await mint0Tx.wait());
    const mint1Tx = await nftA.mint(maker0);
    await printEvents("Minted NFT1", await mint1Tx.wait());
    const mint2Tx = await nftA.mint(maker0);
    await printEvents("Minted NFT1", await mint2Tx.wait());
    const mint3Tx = await nftA.mint(taker0);
    await printEvents("Minted NFT1", await mint3Tx.wait());
    const mint4Tx = await nftA.mint(taker0);
    await printEvents("Minted NFT1", await mint4Tx.wait());
    const mint5Tx = await nftA.mint(taker0);
    await printEvents("Minted NFT1", await mint5Tx.wait());

    const Nix = await ethers.getContractFactory("Nix");
    nix = await Nix.deploy(weth.address);
    await nix.deployed();
    contracts.push(nix);
    addAccount(nix.address, "Nix");
    await printNixDetails("Nix Deployed");

    const wethApproveNix0Tx = await weth.connect(ownerSigner).approve(nix.address, ethers.utils.parseEther("100"));
    await printEvents("WETH.approve(nix)", await wethApproveNix0Tx.wait());
    const wethApproveNix1Tx = await weth.connect(maker0Signer).approve(nix.address, ethers.utils.parseEther("100"));
    await printEvents("WETH.approve(nix)", await wethApproveNix1Tx.wait());
    const wethApproveNix2Tx = await weth.connect(maker1Signer).approve(nix.address, ethers.utils.parseEther("100"));
    await printEvents("WETH.approve(nix)", await wethApproveNix2Tx.wait());
    const wethApproveNix3Tx = await weth.connect(taker0Signer).approve(nix.address, ethers.utils.parseEther("100"));
    await printEvents("WETH.approve(nix)", await wethApproveNix3Tx.wait());
    const wethApproveNix4Tx = await weth.connect(taker1Signer).approve(nix.address, ethers.utils.parseEther("100"));
    await printEvents("WETH.approve(nix)", await wethApproveNix4Tx.wait());

  })


  it("YEAH!", async function () {

    const approve0Tx = await nftA.connect(maker0Signer).setApprovalForAll(nix.address, true);
    printEvents("Approved Nix To Transfer", await approve0Tx.wait());
    console.log();
    const approve1Tx = await nftA.connect(taker0Signer).setApprovalForAll(nix.address, true);
    printEvents("Approved Nix To Transfer", await approve1Tx.wait());
    console.log();
    await printBalances("After Maker Approve Nix To Transfer");
    console.log();

    console.log("    ==== Maker Added Order #0 - Buy NFT1:{3|4|5} for 12.3456e === ");
    const makerAddOrder1Tx = await nix.connect(maker0Signer).makerAddOrder(
      NULLACCOUNT, // taker
      nftA.address, // token
      [ 3, 4, 5 ], // tokenIds
      ethers.utils.parseEther("12.3456"), // weth
      ORDERTYPE_BUYANY, // orderType
      0, // expiry
    );
    await printEvents("Maker Added Order", await makerAddOrder1Tx.wait());
    console.log();
    // await printNixDetails("After Approve And Maker Added Order #0");
    // console.log();

    console.log("    ==== Maker Added Order #1 - Buy NFT1:* for 1.23456e === ");
    const expiry2 = parseInt(new Date() / 1000) + (60 * 60 * 24);
    const makerAddOrder2Tx = await nix.connect(maker0Signer).makerAddOrder(
      NULLACCOUNT, // taker
      nftA.address, // token
      [ ], // tokenIds
      ethers.utils.parseEther("1.23456"), // weth
      ORDERTYPE_BUYANY, // orderType
      expiry2, // expiry
    );
    console.log();
    await printEvents("Maker Added Order", await makerAddOrder2Tx.wait());
    console.log();
    await printNixDetails("Maker Added Order");
    console.log();
    await printBalances("Maker Added Order");
    console.log();

    console.log("    ==== Taker Executed Order #1 - Buy NFT1:{3|4|5} for 12.3456e === ");
    const takerExecuteOrder1Tx = await nix.connect(taker0Signer).takerExecuteOrder(0, [ 3 ], ethers.utils.parseEther("12.3456"));
    await printEvents("Taker Executed", await takerExecuteOrder1Tx.wait());
    console.log();
    await printNixDetails("After Taker Executed Order #1");
    console.log();
    await printBalances("Taker Executed Order #1");
    console.log();

    console.log("    ==== Taker Executed Order #2 - Buy NFT1:* for 1.23456e === ");
    const takerExecuteOrder2Tx = await nix.connect(taker0Signer).takerExecuteOrder(1, [ 4 ], ethers.utils.parseEther("1.23456"));
    await printEvents("Taker Executed", await takerExecuteOrder2Tx.wait());
    console.log();
    await printNixDetails("After Taker Executed Order #2");
    console.log();
    await printBalances("Taker Executed Order #2");
    console.log();

    if (false) {
      const exchangeTx = await nix.connect(maker0Signer).exchange(nftA.address, 1, maker1);
      printEvents("Exchanged", await exchangeTx.wait());
      await printBalances("After Approve And Exchange =");
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
