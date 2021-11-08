const { ZERO_ADDRESS, ORDERTYPE, ORDERTYPESTRING, Data } = require('./helpers/common');
const { singletons, expectRevert } = require("@openzeppelin/test-helpers");
const { expect, assert } = require("chai");
const { BigNumber } = require("ethers");
const util = require('util');

let data;

describe("Nix", function () {
  const DETAILS = 0;

  beforeEach(async function () {
    const TestERC20 = await ethers.getContractFactory("TestERC20");
    const MockRoyaltyEngineV1 = await ethers.getContractFactory("MockRoyaltyEngineV1");
    const ERC721PresetMinterPauserAutoId  = await ethers.getContractFactory("ERC721PresetMinterPauserAutoId");
    const Nix = await ethers.getContractFactory("Nix");
    const NixHelper = await ethers.getContractFactory("NixHelper");
    data = new Data();
    await data.init();

    console.log("        --- Setup Accounts, WETH, NFT and Nix Contracts ---");
    erc1820Registry = await singletons.ERC1820Registry(data.deployer);
    await data.addAccount(erc1820Registry.address, "ERC1820Registry");

    const fixedSupply = ethers.utils.parseEther("500");
    const weth = await TestERC20.deploy("WETH", "Wrapped ETH", 18, fixedSupply);
    await weth.deployed();
    await data.setWeth(weth);

    const royaltyEngine = await MockRoyaltyEngineV1.deploy(data.royalty1, data.royalty2);
    await royaltyEngine.deployed();
    await data.setRoyaltyEngine(royaltyEngine);

    const nftA = await ERC721PresetMinterPauserAutoId.deploy("NFTeeA", "NFTA", "uri");
    await data.setNFTA(nftA);
    const nftATransactionReceipt = await data.nftA.deployTransaction.wait();
    if (DETAILS > 0) {
      await data.printEvents("Deployed NFTA", nftATransactionReceipt);
    }
    const nftB = await ERC721PresetMinterPauserAutoId.deploy("NFTeeB", "NFTB", "uri");
    await data.setNFTB(nftB);
    const nftBTransactionReceipt = await data.nftB.deployTransaction.wait();
    if (DETAILS > 0) {
      await data.printEvents("Deployed NFTB", nftBTransactionReceipt);
    }
    const nix = await Nix.deploy(weth.address, royaltyEngine.address);
    // console.log(nix);
    await nix.deployed();
    await data.setNix(nix);
    const nixTransactionReceipt = await data.nix.deployTransaction.wait();
    if (DETAILS >= 0) {
      await data.printEvents("txFee Deployed Nix", nixTransactionReceipt);
    }

    const nixHelper = await NixHelper.deploy(nix.address);
    // console.log(nixHelper);
    await nixHelper.deployed();
    await data.setNixHelper(nixHelper);
    const nixHelperTransactionReceipt = await data.nixHelper.deployTransaction.wait();
    if (DETAILS >= 0) {
      await data.printEvents("txFee Deployed NixHelper", nixHelperTransactionReceipt);
    }

    const setup1 = [];
    setup1.push(weth.transfer(data.maker0, ethers.utils.parseEther("100")));
    setup1.push(weth.transfer(data.maker1, ethers.utils.parseEther("100")));
    setup1.push(weth.transfer(data.taker0, ethers.utils.parseEther("100")));
    setup1.push(weth.transfer(data.taker1, ethers.utils.parseEther("100")));
    const [transferWeth0Tx, transferWeth1Tx, transferWeth2Tx, transferWeth3Tx] = await Promise.all(setup1);
    if (DETAILS > 0) {
      [transferWeth0Tx, transferWeth1Tx, transferWeth2Tx, transferWeth3Tx].forEach( async function (a) {
        await data.printEvents("Transfer WETH", await a.wait());
      });
    }

    const setup2 = [];
    setup2.push(data.nftA.mint(data.maker0));
    setup2.push(data.nftA.mint(data.maker0));
    setup2.push(data.nftA.mint(data.maker0));
    setup2.push(data.nftA.mint(data.taker0));
    setup2.push(data.nftA.mint(data.taker0));
    setup2.push(data.nftA.mint(data.taker0));
    const mintATxs = await Promise.all(setup2);
    if (DETAILS > 0) {
      mintATxs.forEach( async function (a) {
        await data.printEvents("Minted NFTA", await a.wait());
      });
    }

    const setup3 = [];
    setup3.push(data.nftB.mint(data.maker0));
    setup3.push(data.nftB.mint(data.maker0));
    setup3.push(data.nftB.mint(data.maker0));
    setup3.push(data.nftB.mint(data.taker0));
    setup3.push(data.nftB.mint(data.taker0));
    setup3.push(data.nftB.mint(data.taker0));
    const mintBTxs = await Promise.all(setup3);
    if (DETAILS > 0) {
      mintBTxs.forEach( async function (a) {
        await data.printEvents("Minted NFTB", await a.wait());
      });
    }

    const setup4 = [];
    setup4.push(weth.connect(data.deployerSigner).approve(nix.address, ethers.utils.parseEther("100")));
    setup4.push(weth.connect(data.maker0Signer).approve(nix.address, ethers.utils.parseEther("100")));
    setup4.push(weth.connect(data.maker1Signer).approve(nix.address, ethers.utils.parseEther("100")));
    setup4.push(weth.connect(data.taker0Signer).approve(nix.address, ethers.utils.parseEther("100")));
    setup4.push(weth.connect(data.taker1Signer).approve(nix.address, ethers.utils.parseEther("100")));
    const [wethApproveNix0Tx, wethApproveNix1Tx, wethApproveNix2Tx, wethApproveNix3Tx, wethApproveNix4Tx] = await Promise.all(setup4);
    if (DETAILS > 0) {
      [wethApproveNix0Tx, wethApproveNix1Tx, wethApproveNix2Tx, wethApproveNix3Tx, wethApproveNix4Tx].forEach( async function (a) {
        await data.printEvents("WETH.approve(nix)", await a.wait());
      });
    }

    const setup5 = [];
    setup5.push(data.nftA.connect(data.maker0Signer).setApprovalForAll(nix.address, true));
    setup5.push(data.nftA.connect(data.maker1Signer).setApprovalForAll(nix.address, true));
    setup5.push(data.nftA.connect(data.taker0Signer).setApprovalForAll(nix.address, true));
    setup5.push(data.nftA.connect(data.taker1Signer).setApprovalForAll(nix.address, true));
    const [approve0Tx, approve1Tx, approve2Tx, approve3Tx] = await Promise.all(setup5);
    if (DETAILS > 0) {
      [approve0Tx, approve1Tx, approve2Tx, approve3Tx].forEach( async function (a) {
        await data.printEvents("NFTA.approved(nix)", await a.wait());
      });
    }
    // console.log("bytecode ~" + JSON.stringify(nix.deployTransaction.data.length/2, null, 2));
    await data.printState("Setup Completed. Nix bytecode ~" + nix.deployTransaction.data.length/2 + ", NixHelper bytecode ~" + nixHelper.deployTransaction.data.length/2);
  })

  it.only("00. Maker BuyAny Test", async function () {
    console.log("        --- Maker Add Orders ---");
    const makerAddOrder1Tx = await data.nix.connect(data.maker0Signer).makerAddOrder(ZERO_ADDRESS, data.nftA.address, [ 3, 4, 5 ], ethers.utils.parseEther("11"), ORDERTYPE.BUYANY, 0, 5, 100, data.integrator, { value: ethers.utils.parseEther("0.000000001") });
    await data.printEvents("txFee Maker Added Order #0 - BuyAny Max 2 NFTA:{3|4|5} for 11e", await makerAddOrder1Tx.wait());
    const expiry2 = parseInt(new Date() / 1000) + (60 * 60 * 24);
    const makerAddOrder2Tx = await data.nix.connect(data.maker0Signer).makerAddOrder(ZERO_ADDRESS, data.nftA.address, [ ], ethers.utils.parseEther("0.0011"), ORDERTYPE.BUYANY, expiry2, 5, 100, data.integrator, { value: ethers.utils.parseEther("0.000000001") });
    await data.printEvents("Maker Added Order #1 - BuyAny Max 2 NFTA:* for 0.0011e", await makerAddOrder2Tx.wait());
    const makerAddOrder3Tx = await data.nix.connect(data.maker0Signer).makerAddOrder(ZERO_ADDRESS, data.nftB.address, [ 3, 4, 5 ], ethers.utils.parseEther("22"), ORDERTYPE.BUYANY, 0, 5, 100, data.integrator, { value: ethers.utils.parseEther("0.000000001") });
    await data.printEvents("txFee Maker Added Order #0 - BuyAny Max 2 NFTB:{3|4|5} for 22e", await makerAddOrder3Tx.wait());
    await data.printState("After Maker Added Orders");

    console.log("        --- Taker Execute Against Orders ---");
    const takerExecuteOrder1Tx = await data.nix.connect(data.taker0Signer).takerExecuteOrders([data.nftA.address, data.nftA.address], [0, 1], [[ 3, 5 ], [4]], ethers.utils.parseEther("22.0011").mul(7).div(10), 100, data.integrator, { value: ethers.utils.parseEther("0.000000001") });
    // const takerExecuteOrder1Tx = await data.nix.connect(data.taker0Signer).takerExecuteOrders([data.nftA.address], [1], [[4]], ethers.utils.parseEther("0.0011"), data.integrator, { value: ethers.utils.parseEther("0.000000001") });
    // const takerExecuteOrder1Tx = await data.nix.connect(data.taker0Signer).takerExecuteOrders([0], [[ 3]], ethers.utils.parseEther("11.00"), data.integrator, { value: ethers.utils.parseEther("0.000000001") });
    await data.printEvents("txFee Taker Sold #3 against BuyAny Max 2 NFTA:{3|4|5} for 11e" , await takerExecuteOrder1Tx.wait());
    // const takerExecuteOrder2Tx = await data.nix.connect(data.taker0Signer).takerExecuteOrder(1, [ 4 ], ethers.utils.parseEther("0.0011"), data.integrator, { value: ethers.utils.parseEther("0.000000001") });
    // await data.printEvents("Taker Sold #4 against BuyAny Max 2 NFTA:* for 0.0011e", await takerExecuteOrder2Tx.wait());
    await data.printState("After Taker Executed Orders");
  });

  it("0Old. Maker BuyAny Test", async function () {
    console.log("        --- Maker Add Orders ---");
    const makerAddOrder1Tx = await data.nix.connect(data.maker0Signer).makerAddOrder(ZERO_ADDRESS, data.nftA.address, [ 3, 4, 5 ], ethers.utils.parseEther("11"), ORDERTYPE.BUYANY, 0, 5, data.integrator, { value: ethers.utils.parseEther("0.000000001") });
    await data.printEvents("txFee Maker Added Order #0 - BuyAny Max 2 NFTA:{3|4|5} for 11e", await makerAddOrder1Tx.wait());
    const expiry2 = parseInt(new Date() / 1000) + (60 * 60 * 24);
    const makerAddOrder2Tx = await data.nix.connect(data.maker0Signer).makerAddOrder(ZERO_ADDRESS, data.nftA.address, [ ], ethers.utils.parseEther("0.0011"), ORDERTYPE.BUYANY, expiry2, 5, data.integrator, { value: ethers.utils.parseEther("0.000000001") });
    await data.printEvents("Maker Added Order #1 - BuyAny Max 2 NFTA:* for 0.0011e", await makerAddOrder2Tx.wait());
    await data.printState("After Maker Added Orders");

    console.log("        --- Taker Execute Against Orders ---");
    const takerExecuteOrder1Tx = await data.nix.connect(data.taker0Signer).takerExecuteOrder(0, [ 3, 5 ], ethers.utils.parseEther("22"), data.integrator, { value: ethers.utils.parseEther("0.000000001") });
    await data.printEvents("txFee Taker Sold #3 against BuyAny Max 2 NFTA:{3|4|5} for 11e" , await takerExecuteOrder1Tx.wait());
    const takerExecuteOrder2Tx = await data.nix.connect(data.taker0Signer).takerExecuteOrder(1, [ 4 ], ethers.utils.parseEther("0.0011"), data.integrator, { value: ethers.utils.parseEther("0.000000001") });
    await data.printEvents("Taker Sold #4 against BuyAny Max 2 NFTA:* for 0.0011e", await takerExecuteOrder2Tx.wait());
    await data.printState("After Taker Executed Orders");
  });

  it("1. Maker SellAny Test", async function () {
    console.log("        --- Maker Add Orders ---");
    const makerAddOrder1Tx = await data.nix.connect(data.maker0Signer).makerAddOrder(ZERO_ADDRESS, data.nftA.address, [ 0, 1, 2 ], ethers.utils.parseEther("12.3456"), ORDERTYPE.SELLANY, 0, 1, data.integrator, { value: ethers.utils.parseEther("0.000000001") });
    await data.printEvents("Maker Added Order #0 - SellAny NFTA:{0|1|2} for 12.3456e", await makerAddOrder1Tx.wait());
    const expiry2 = parseInt(new Date() / 1000) + (60 * 60 * 24);
    const makerAddOrder2Tx = await data.nix.connect(data.maker0Signer).makerAddOrder(ZERO_ADDRESS, data.nftA.address, [ ], ethers.utils.parseEther("1.23456"), ORDERTYPE.SELLANY, expiry2, 1, data.integrator, { value: ethers.utils.parseEther("0.000000001") });
    await data.printEvents("Maker Added Order #1 - SellAny NFTA:* for 1.23456e", await makerAddOrder2Tx.wait());
    await data.printState("After Maker Added Orders");

    console.log("        --- Taker Execute Against Orders ---");
    const takerExecuteOrder1Tx = await data.nix.connect(data.taker0Signer).takerExecuteOrder(0, [ 1 ], ethers.utils.parseEther("12.3456"), data.integrator, { value: ethers.utils.parseEther("0.000000001") });
    await data.printEvents("Taker Bought #1 against SellAny NFTA:{0|1|2} for 12.3456e" , await takerExecuteOrder1Tx.wait());
    const takerExecuteOrder2Tx = await data.nix.connect(data.taker0Signer).takerExecuteOrder(1, [ 2 ], ethers.utils.parseEther("1.23456"), data.integrator, { value: ethers.utils.parseEther("0.000000001") });
    await data.printEvents("Taker Bought #2 against SellAny NFTA:* for 1.23456e", await takerExecuteOrder2Tx.wait());
    await data.printState("After Taker Executed Orders");
  });

  it("2. Maker BuyAll Test", async function () {
    console.log("        --- Maker Add Orders ---");
    const makerAddOrder1Tx = await data.nix.connect(data.maker0Signer).makerAddOrder(ZERO_ADDRESS, data.nftA.address, [ 3, 4, 5 ], ethers.utils.parseEther("12.3456"), ORDERTYPE.BUYALL, 0, 1, data.integrator, { value: ethers.utils.parseEther("0.000000001") });
    await data.printEvents("Maker Added Order #0 - BuyAll NFTA:{3&4&5} for 12.3456e", await makerAddOrder1Tx.wait());
    await data.printState("After Maker Added Orders");

    console.log("        --- Taker Execute Against Orders ---");
    const takerExecuteOrder1Tx = await data.nix.connect(data.taker0Signer).takerExecuteOrder(0, [ 3, 4, 5 ], ethers.utils.parseEther("12.3456"), data.integrator, { value: ethers.utils.parseEther("0.000000001") });
    await data.printEvents("Taker Sold #3,#4&#5 against BuyAll NFTA:{3&4&5} for 12.3456e" , await takerExecuteOrder1Tx.wait());
    await data.printState("After Taker Executed Orders");
  });

  it("3. Maker SellAll Test & Owner Withdraw Tips", async function () {
    console.log("        --- Maker Add Orders ---");
    const makerAddOrder1Tx = await data.nix.connect(data.maker0Signer).makerAddOrder(ZERO_ADDRESS, data.nftA.address, [ 0, 1, 2 ], ethers.utils.parseEther("12.3456"), ORDERTYPE.SELLALL, 0, 1, data.integrator, { value: ethers.utils.parseEther("0.000000001") });
    await data.printEvents("Maker Added Order #0 - SellAll NFTA:{0&1&2} for 12.3456e", await makerAddOrder1Tx.wait());
    await data.printState("After Maker Added Orders");

    console.log("        --- Taker Execute Against Orders ---");
    const takerExecuteOrder1Tx = await data.nix.connect(data.taker0Signer).takerExecuteOrder(0, [ 0, 1, 2 ], ethers.utils.parseEther("12.3456"), data.integrator, { value: ethers.utils.parseEther("0.000000001") });
    await data.printEvents("Taker Bought #0,#1&#2 against SellAll NFTA:{0&1&2} for 12.3456e" , await takerExecuteOrder1Tx.wait());
    await data.printState("After Taker Executed Orders");

    console.log("        --- Send Nix ETH Tip ---");
    const sendNixTip0Tx = await data.deployerSigner.sendTransaction({ to: data.nix.address, value: ethers.utils.parseEther("8.888") });
    await data.printEvents("txFee Send Nix ETH Tip" , await sendNixTip0Tx.wait());
    await data.printState("After Send Nix ETH Tip");

    console.log("        --- Owner Withdraw Tips ---");
    const ownerWithdrawTips0Tx = await data.nix.connect(data.deployerSigner).withdrawTips(ZERO_ADDRESS, 0, 0);
    await data.printEvents("txFee Owner Withdrawn Tips" , await ownerWithdrawTips0Tx.wait());
    await data.printState("After Owner Withdrawn Tips");

    console.log("        --- Send Nix WETH Tip ---");
    const sendNixWETHTip0Tx = await data.weth.connect(data.taker0Signer).transfer(data.nix.address, ethers.utils.parseEther("3.33"));
    await data.printEvents("txFee Send Nix WETH Tip" , await sendNixWETHTip0Tx.wait());
    await data.printState("After Send Nix WETH Tip");

    console.log("        --- Owner Withdraw WETH Tips ---");
    const ownerWithdrawWETHTips0Tx = await data.nix.connect(data.deployerSigner).withdrawTips(data.weth.address, 0, 0);
    await data.printEvents("txFee Owner Withdrawn WETH Tips" , await ownerWithdrawWETHTips0Tx.wait());
    await data.printState("After Owner Withdrawn WETH Tips");

    console.log("        --- Taker0 Transfer NFTA To Nix For Donation ---");
    const takerTransferNFTToNixTx = await data.nftA.connect(data.taker0Signer)["safeTransferFrom(address,address,uint256)"](data.taker0, data.nix.address, 3);
    await data.printEvents("Taker0 Transfer NFTA To Nix For Donation" , await takerTransferNFTToNixTx.wait());
    await data.printState("After Taker0 Transfer NFTA To Nix For Donation");

    console.log("        --- Owner Withdraw NFT Tips ---");
    const ownerWithdrawNFTTips1Tx = await data.nix.connect(data.deployerSigner).withdrawTips(data.nftA.address, 0, 3);
    await data.printEvents("txFee Owner Withdrawn Tips" , await ownerWithdrawNFTTips1Tx.wait());
    await data.printState("After Owner Withdrawn Tips");

  });
});


// if (false) {
//   const exchangeTx = await data.nix.connect(data.maker0Signer).exchange(nftA.address, 1, maker1);
//   printEvents("Exchanged", await exchangeTx.wait());
//   await data.printState("After Approve And Exchange =");
// }
// expect(await data.nix.greet()).to.equal("Hello, world!");
//
// const setGreetingTx = await data.nix.setGreeting("Hola, mundo!");
//
// // wait until the transaction is mined
// await setGreetingTx.wait();
//
// expect(await data.nix.greet()).to.equal("Hola, mundo!");
