const { ZERO_ADDRESS, ORDERTYPE, ORDERTYPESTRING, Data } = require('./helpers/common');
const { singletons, expectRevert } = require("@openzeppelin/test-helpers");
const { expect, assert } = require("chai");
const { BigNumber } = require("ethers");
const util = require('util');

let data;

describe("Nix", function () {
  const orderStatuses = [ "Active", "Cancelled", "Executed", "NotExecutable" ];
  const DETAILS = 0;

  let deployer, maker0, maker1, taker0, taker1, deployerSigner, maker0Signer, maker1Signer, taker0Signer, taker1Signer, erc1820Registry, simpleERC721, nftA = null, weth, nix = null;

  beforeEach(async function () {
    data = new Data();
    await data.init();

    [deployer, maker0, maker1, taker0, taker1] = await web3.eth.getAccounts();
    [deployerSigner, maker0Signer, maker1Signer, taker0Signer, taker1Signer] = await ethers.getSigners();
    console.log();
    console.log();
    console.log("    ==== Setup Accounts, WETH, NFT and Nix Contracts === ");

    erc1820Registry = await singletons.ERC1820Registry(deployer);
    await data.addAccount(erc1820Registry.address, "ERC1820Registry");

    const TestERC20 = await ethers.getContractFactory("TestERC20");
    const fixedSupply = ethers.utils.parseEther("500");
    weth = await TestERC20.deploy("WETH", "Wrapped ETH", 18, fixedSupply);
    await weth.deployed();
    await data.setWeth(weth);
    const transferWeth0Tx = await weth.transfer(maker0, ethers.utils.parseEther("100"));
    const transferWeth1Tx = await weth.transfer(maker1, ethers.utils.parseEther("100"));
    const transferWeth2Tx = await weth.transfer(taker0, ethers.utils.parseEther("100"));
    const transferWeth3Tx = await weth.transfer(taker1, ethers.utils.parseEther("100"));
    if (DETAILS > 0) {
      await data.printEvents("Transfer WETH", await transferWeth0Tx.wait());
      await data.printEvents("Transfer WETH", await transferWeth1Tx.wait());
      await data.printEvents("Transfer WETH", await transferWeth2Tx.wait());
      await data.printEvents("Transfer WETH", await transferWeth3Tx.wait());
    }

    const ERC721PresetMinterPauserAutoId  = await ethers.getContractFactory("ERC721PresetMinterPauserAutoId");
    nftA = await ERC721PresetMinterPauserAutoId.deploy("NFTeeA", "NFTA", "uri");
    await data.addContract(nftA, "NFTA");
    await data.setNFTA(nftA);
    const nftATransactionReceipt = await nftA.deployTransaction.wait();
    if (DETAILS > 0) {
      await data.printEvents("Deployed NFTA", nftATransactionReceipt);
    }

    const mint0Tx = await nftA.mint(maker0);
    const mint1Tx = await nftA.mint(maker0);
    const mint2Tx = await nftA.mint(maker0);
    const mint3Tx = await nftA.mint(taker0);
    const mint4Tx = await nftA.mint(taker0);
    const mint5Tx = await nftA.mint(taker0);
    if (DETAILS > 0) {
      await data.printEvents("Minted NFTA", await mint0Tx.wait());
      await data.printEvents("Minted NFTA", await mint1Tx.wait());
      await data.printEvents("Minted NFTA", await mint2Tx.wait());
      await data.printEvents("Minted NFTA", await mint3Tx.wait());
      await data.printEvents("Minted NFTA", await mint4Tx.wait());
      await data.printEvents("Minted NFTA", await mint5Tx.wait());
    }

    const Nix = await ethers.getContractFactory("Nix");
    nix = await Nix.deploy(weth.address);
    await nix.deployed();
    data.addContract(nix, "Nix");
    await data.setNix(nix);

    const wethApproveNix0Tx = await weth.connect(deployerSigner).approve(nix.address, ethers.utils.parseEther("100"));
    const wethApproveNix1Tx = await weth.connect(maker0Signer).approve(nix.address, ethers.utils.parseEther("100"));
    const wethApproveNix2Tx = await weth.connect(maker1Signer).approve(nix.address, ethers.utils.parseEther("100"));
    const wethApproveNix3Tx = await weth.connect(taker0Signer).approve(nix.address, ethers.utils.parseEther("100"));
    const wethApproveNix4Tx = await weth.connect(taker1Signer).approve(nix.address, ethers.utils.parseEther("100"));
    if (DETAILS > 0) {
      await data.printEvents("WETH.approve(nix)", await wethApproveNix0Tx.wait());
      await data.printEvents("WETH.approve(nix)", await wethApproveNix1Tx.wait());
      await data.printEvents("WETH.approve(nix)", await wethApproveNix2Tx.wait());
      await data.printEvents("WETH.approve(nix)", await wethApproveNix3Tx.wait());
      await data.printEvents("WETH.approve(nix)", await wethApproveNix4Tx.wait());
    }

    const approve0Tx = await nftA.connect(maker0Signer).setApprovalForAll(nix.address, true);
    const approve1Tx = await nftA.connect(maker1Signer).setApprovalForAll(nix.address, true);
    const approve2Tx = await nftA.connect(taker0Signer).setApprovalForAll(nix.address, true);
    const approve3Tx = await nftA.connect(taker1Signer).setApprovalForAll(nix.address, true);
    if (DETAILS > 0) {
      await data.printEvents("Approved Nix To Transfer", await approve0Tx.wait());
      await data.printEvents("Approved Nix To Transfer", await approve1Tx.wait());
      await data.printEvents("Approved Nix To Transfer", await approve2Tx.wait());
      await data.printEvents("Approved Nix To Transfer", await approve3Tx.wait());
    }
    await data.printState("After Maker Approve Nix To Transfer");
    await data.printState("After Maker Approve Nix To Transfer");
  })

  it("0. Maker BuyAny Test", async function () {
    console.log("    ==== Maker Add Orders === ");

    const makerAddOrder1Tx = await nix.connect(maker0Signer).makerAddOrder(ZERO_ADDRESS, nftA.address, [ 3, 4, 5 ], ethers.utils.parseEther("11"), ORDERTYPE.BUYANY, 0, 2, { value: ethers.utils.parseEther("0.000000001") });
    await data.printEvents("Maker Added Order #0 - BuyAny Max 2 NFTA:{3|4|5} for 11e", await makerAddOrder1Tx.wait());
    const expiry2 = parseInt(new Date() / 1000) + (60 * 60 * 24);
    const makerAddOrder2Tx = await nix.connect(maker0Signer).makerAddOrder(ZERO_ADDRESS, nftA.address, [ ], ethers.utils.parseEther("0.0011"), ORDERTYPE.BUYANY, expiry2, 2, { value: ethers.utils.parseEther("0.000000001") });
    await data.printEvents("Maker Added Order #1 - BuyAny Max 2 NFTA:* for 0.0011e", await makerAddOrder2Tx.wait());
    await data.printState("After Maker Added Orders");

    console.log("    ==== Taker Execute Against Orders === ");
    const takerExecuteOrder1Tx = await nix.connect(taker0Signer).takerExecuteOrder(0, [ 3, 5 ], ethers.utils.parseEther("22"), { value: ethers.utils.parseEther("0.000000001") });
    await data.printEvents("Taker Sold #3 against BuyAny Max 2 NFTA:{3|4|5} for 11e" , await takerExecuteOrder1Tx.wait());
    const takerExecuteOrder2Tx = await nix.connect(taker0Signer).takerExecuteOrder(1, [ 4 ], ethers.utils.parseEther("0.0011"), { value: ethers.utils.parseEther("0.000000001") });
    await data.printEvents("Taker Sold #4 against BuyAny Max 2 NFTA:* for 0.0011e", await takerExecuteOrder2Tx.wait());
    await data.printState("After Taker Executed Orders");
  });

  it("1. Maker SellAny Test", async function () {
    console.log("    ==== Maker Add Orders === ");
    const makerAddOrder1Tx = await nix.connect(maker0Signer).makerAddOrder(ZERO_ADDRESS, nftA.address, [ 0, 1, 2 ], ethers.utils.parseEther("12.3456"), ORDERTYPE.SELLANY, 0, 1, { value: ethers.utils.parseEther("0.000000001") });
    await data.printEvents("Maker Added Order #0 - SellAny NFTA:{0|1|2} for 12.3456e", await makerAddOrder1Tx.wait());
    const expiry2 = parseInt(new Date() / 1000) + (60 * 60 * 24);
    const makerAddOrder2Tx = await nix.connect(maker0Signer).makerAddOrder(ZERO_ADDRESS, nftA.address, [ ], ethers.utils.parseEther("1.23456"), ORDERTYPE.SELLANY, expiry2, 1, { value: ethers.utils.parseEther("0.000000001") });
    await data.printEvents("Maker Added Order #1 - SellAny NFTA:* for 1.23456e", await makerAddOrder2Tx.wait());
    await data.printState("After Maker Added Orders");

    console.log("    ==== Taker Execute Against Orders === ");
    const takerExecuteOrder1Tx = await nix.connect(taker0Signer).takerExecuteOrder(0, [ 1 ], ethers.utils.parseEther("12.3456"), { value: ethers.utils.parseEther("0.000000001") });
    await data.printEvents("Taker Bought #1 against SellAny NFTA:{0|1|2} for 12.3456e" , await takerExecuteOrder1Tx.wait());
    const takerExecuteOrder2Tx = await nix.connect(taker0Signer).takerExecuteOrder(1, [ 2 ], ethers.utils.parseEther("1.23456"), { value: ethers.utils.parseEther("0.000000001") });
    await data.printEvents("Taker Bought #2 against SellAny NFTA:* for 1.23456e", await takerExecuteOrder2Tx.wait());
    await data.printState("After Taker Executed Orders");
  });

  it("2. Maker BuyAll Test", async function () {
    console.log("    ==== Maker Add Orders === ");
    const makerAddOrder1Tx = await nix.connect(maker0Signer).makerAddOrder(ZERO_ADDRESS, nftA.address, [ 3, 4, 5 ], ethers.utils.parseEther("12.3456"), ORDERTYPE.BUYALL, 0, 1, { value: ethers.utils.parseEther("0.000000001") });
    await data.printEvents("Maker Added Order #0 - BuyAll NFTA:{3&4&5} for 12.3456e", await makerAddOrder1Tx.wait());
    await data.printState("After Maker Added Orders");

    console.log("    ==== Taker Execute Against Orders === ");
    const takerExecuteOrder1Tx = await nix.connect(taker0Signer).takerExecuteOrder(0, [ 3, 4, 5 ], ethers.utils.parseEther("12.3456"), { value: ethers.utils.parseEther("0.000000001") });
    await data.printEvents("Taker Sold #3,#4&#5 against BuyAll NFTA:{3&4&5} for 12.3456e" , await takerExecuteOrder1Tx.wait());
    await data.printState("After Taker Executed Orders");
  });

  it("3. Maker SellAll Test", async function () {
    console.log("    ==== Maker Add Orders === ");
    const makerAddOrder1Tx = await nix.connect(maker0Signer).makerAddOrder(ZERO_ADDRESS, nftA.address, [ 0, 1, 2 ], ethers.utils.parseEther("12.3456"), ORDERTYPE.SELLALL, 0, 1, { value: ethers.utils.parseEther("0.000000001") });
    await data.printEvents("Maker Added Order #0 - SellAll NFTA:{0&1&2} for 12.3456e", await makerAddOrder1Tx.wait());
    await data.printState("After Maker Added Orders");

    console.log("    ==== Taker Execute Against Orders === ");
    const takerExecuteOrder1Tx = await nix.connect(taker0Signer).takerExecuteOrder(0, [ 0, 1, 2 ], ethers.utils.parseEther("12.3456"), { value: ethers.utils.parseEther("0.000000001") });
    await data.printEvents("Taker Bought #0,#1&#2 against SellAll NFTA:{0&1&2} for 12.3456e" , await takerExecuteOrder1Tx.wait());
    await data.printState("After Taker Executed Orders");
  });
});


// if (false) {
//   const exchangeTx = await nix.connect(maker0Signer).exchange(nftA.address, 1, maker1);
//   printEvents("Exchanged", await exchangeTx.wait());
//   await data.printState("After Approve And Exchange =");
// }
// expect(await nix.greet()).to.equal("Hello, world!");
//
// const setGreetingTx = await nix.setGreeting("Hola, mundo!");
//
// // wait until the transaction is mined
// await setGreetingTx.wait();
//
// expect(await nix.greet()).to.equal("Hola, mundo!");
