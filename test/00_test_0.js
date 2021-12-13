const { ZERO_ADDRESS, BUYORSELL, ANYORALL, BUYORSELLSTRING, ANYORALLSTRING, Data } = require('./helpers/common');
const { singletons, expectRevert } = require("@openzeppelin/test-helpers");
const { expect, assert } = require("chai");
const { BigNumber } = require("ethers");
const util = require('util');

let data;

describe("Nix", function () {
  const DETAILS = 1;

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
    setup2.push(data.nftA.mint(data.maker1)); //6
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
    
    await data.printState("Setup Completed. Nix bytecode ~" + nix.deployTransaction.data.length/2 + ", NixHelper bytecode ~" + nixHelper.deployTransaction.data.length/2);
  })

  it.only(`security.00 Maker adds an sell order of an unowned NFT,
                       Taker executes,
                       Maker receives funds,
                       Takers receives no NFT.
                       Tx is successful`, async function () {
     const unowned_tokenId = "6";
     const balanceOfBefore_maker0 = (await data.weth.balanceOf(data.maker0Signer.address)).toString();
     const balanceOfBefore_taker0 = (await data.weth.balanceOf(data.taker0Signer.address)).toString();
     console.log("        > Check if the NFT is owned by Maker0, expect false ---");
     assert.notEqual(await data.nftA.connect(data.maker0Signer).ownerOf(unowned_tokenId),
                     data.maker0Signer.address);
     console.log(`        >> success assert: NFT is not owned by maker0`);
     console.log(`        > maker0 to add an sell order of NFT(unowned)`);
     const addOrder1Tx = await data.nix.connect(data.maker0Signer).addOrder(data.nftA.address, ZERO_ADDRESS, BUYORSELL.SELL, ANYORALL.ANY, [ unowned_tokenId ], ethers.utils.parseEther("11"), 0, 1, 0, data.integrator, { value: ethers.utils.parseEther("0.000001") });
     console.log(`        > taker0 to execute the sell order for NFT(unowned by maker0)`);
     const executeOrder1Tx = await data.nix.connect(data.taker0Signer).executeOrders([data.nftA.address], [0], [ [unowned_tokenId] ], ethers.utils.parseEther("-11"), 0, data.integrator, { value: ethers.utils.parseEther("0.000001") });
     console.log("        > Check if the NFT is received by Taker0, expect false ---");
     assert.notEqual(await data.nftA.connect(data.taker0Signer).ownerOf(unowned_tokenId),
                     data.taker0Signer.address);
     console.log(`        >> success assert: NFT is not received by taker0`);
     const balanceOfAfter_maker0 = (await data.weth.balanceOf(data.maker0Signer.address)).toString();
     const balanceOfAfter_taker0 = (await data.weth.balanceOf(data.taker0Signer.address)).toString();
     console.log(`        >> weth balance before and after executeOrders`);
     console.log(`        Before executeOrders: Maker0 Balance: ${balanceOfBefore_maker0}`);
     console.log(`        After executeOrders: Maker0 Balance:  ${balanceOfAfter_maker0}`);
     console.log(`        Before executeOrders: Take0 Balance:  ${balanceOfBefore_taker0}`);
     console.log(`        After executeOrders: Take0 Balance:   ${balanceOfAfter_taker0}`);

  });

});
