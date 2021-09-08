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

  async function printERC721Details(prefix) {
    const totalSupply = await nft1.totalSupply();
    console.log("    --- " + prefix + " - ERC721 '" + await nft1.name() + "' '" + await nft1.symbol() + "' " + totalSupply + " ---");
    for (let i = 0; i < totalSupply; i++) {
      const ownerOf = await nft1.ownerOf(i);
      console.log("        " + i + " " + getShortAccountName(ownerOf));
    }
  }

  async function printNixDetails(prefix) {
    const ordersLength = await nix.ordersLength();
    console.log("    --- " + prefix + " - Nix - orders: " + ordersLength + " ---");
    for (let i = 0; i < ordersLength; i++) {
      const order = await nix.getOrderByIndex(i);

      const expiry = order[10];
      const orderStatus = order[11];

      const maker = order[0];
      const makerWeth = order[4];
      const makerType = order[8];
      console.log("        " + i + " maker: " + getShortAccountName(maker) + ", makerWeth: " + ethers.utils.formatEther(makerWeth) + ", expiry: " + expiry + ", orderStatus: " + orderStatus);
      const makerTokens = order[2];
      const makerTokenIds = order[3];
      for (let j = 0; j < makerTokens.length; j++) {
        console.log("          - " + j + ". token: " + getShortAccountName(makerTokens[j]) + ", tokenId: " + makerTokenIds[j]);
      }

      const taker = order[1];
      const takerWeth = order[7];
      const takerType = order[9];
      console.log("          taker: " + getShortAccountName(taker) + ", takerWeth: " + ethers.utils.formatEther(takerWeth));
      const takerTokens = order[5];
      const takerTokenIds = order[6];
      for (let j = 0; j < takerTokens.length; j++) {
        console.log("          - " + j + ". token: " + getShortAccountName(takerTokens[j]) + ", tokenId: " + takerTokenIds[j]);
      }

      // console.log("        " + i + " " + JSON.stringify(order));
      // console.log("        " + i + " " + JSON.stringify(order.map((x) => { return x.toString(); })));
    }
  }

  // struct Order {
  //     address maker;
  //     address taker;
  //
  //     address[] makerTokens;
  //     uint[] makerTokenIds;
  //     uint makerWeth;
  //
  //     address[] takerTokens;
  //     uint[] takerTokenIds;
  //     uint takerWeth;
  //
  //     OrderType makerType;
  //     OrderType takerType;
  //     uint64 expiry;
  //     OrderStatus orderStatus;
  // }



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

    // const SimpleERC721 = await ethers.getContractFactory("SimpleERC721");
    // simpleERC721 = await SimpleERC721.deploy();
    // addAccount(simpleERC721.address, "SimpleERC721");
    // printERC721Details(true);
    // const deploySimpleERC721TransactionReceipt = await simpleERC721.deployTransaction.wait();
    // printEvents(simpleERC721, deploySimpleERC721TransactionReceipt);

  })


  it("Should return the new greeting once it's changed", async function () {

    // const SimpleERC721 = await ethers.getContractFactory("SimpleERC721");
    // const simpleERC721 = await SimpleERC721.deploy();
    // await simpleERC721.deployed();
    //
    // const simpleERC721Symbol = await simpleERC721.symbol();
    // const simpleERC721Name = await simpleERC721.name();
    // console.log(simpleERC721Symbol + " - " + simpleERC721Name);

    const approveTx = await nft1.connect(user0Signer).setApprovalForAll(nix.address, true);
    printEvents("Approved Nix To Transfer", await approveTx.wait());
    await printERC721Details("After Maker Approve Nix To Transfer");

    const exchangeTx = await nix.connect(user0Signer).makerAddOrder(
      NULLACCOUNT, // taker
      [ nft1.address ], // makerTokens
      [ 1 ], // makerTokenIds
      0, // makerWeth
      [  ], // takerTokens
      [  ], // takerTokenIds
      ethers.utils.parseUnits("123.456", 18), // takerWeth
      0, // makerType
      0, // takerType
      0, // expiry
    );
    printEvents("Maker Added Order", await exchangeTx.wait());
    await printNixDetails("After Approve And Maker Added Order");


        // enum OrderType { All, Any }
        // enum OrderStatus { Active, Cancelled, Executed }
        //
        // struct Order {
        //     address maker;
        //     address taker;
        //
        //     address[] makerTokens;
        //     uint[] makerTokenIds;
        //     uint makerWeth;
        //
        //     address[] takerTokens;
        //     uint[] takerTokenIds;
        //     uint takerWeth;
        //
        //     OrderType makerType;
        //     OrderType takerType;
        //     uint64 expiry;
        //     OrderStatus orderStatus;
        // }


    if (false) {
      const exchangeTx = await nix.connect(user0Signer).exchange(nft1.address, 1, user1);
      printEvents("Exchanged", await exchangeTx.wait());
      await printERC721Details("After Approve And Exchange =");
    }


    // const exchangeTx = await nix.connect(user0Signer).exchange(nft1.address, 1, user1);
    // printEvents([nix, nft1], await exchangeTx.wait());
    // await printERC721Details();

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
