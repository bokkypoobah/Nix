const { singletons, expectRevert } = require("@openzeppelin/test-helpers");
const { expect, assert } = require("chai");
const { BigNumber } = require("ethers");
const util = require('util');

describe("Nix", function () {

  let owner, user0, user1, ownerSigner, user0Signer, user1Signer, erc1820Registry, simpleERC721, erc721PresetMinterPauserAutoId;
  const accounts = [];
  const accountNames = {};

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

  function printEvents(contracts, receipt) {
    console.log("      Gas used: " + receipt.gasUsed);
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
          console.log("      + " + getShortAccountName(log.address) + " " + log.blockNumber + "." + log.logIndex + " " + result);
          found = true;
        } catch (e) {
        }
      }
      if (!found) {
        console.log("      + " + getShortAccountName(log.address) + " " + JSON.stringify(log.topics));
      }
    });
  }

  async function printERC721Details(header = false) {
    console.log("    --- printERC721Details ---");
    if (header) {
      console.log("      - name: " + await erc721PresetMinterPauserAutoId.name());
      console.log("      - symbol: " + await erc721PresetMinterPauserAutoId.symbol());
    }
    const totalSupply = await erc721PresetMinterPauserAutoId.totalSupply();
    console.log("      - totalSupply: " + totalSupply);
    for (let i = 0; i < totalSupply; i++) {
      const ownerOf = await erc721PresetMinterPauserAutoId.ownerOf(i);
      console.log("        " + i + " " + getShortAccountName(ownerOf));
    }
  }



  before(async function () {
    [owner, user0, user1] = await web3.eth.getAccounts();
    [ownerSigner, user0Signer, user1Signer] = await ethers.getSigners();
    console.log("    --- Setup ---");
    [owner, user0, user1] = await web3.eth.getAccounts();
    [ownerSigner, user0Signer, user1Signer] = await ethers.getSigners();

    console.log("    --- Setup ---");
    addAccount("0x0000000000000000000000000000000000000000", "null");
    addAccount(owner, "owner");
    addAccount(user0, "user0");
    addAccount(user1, "user1");

    erc1820Registry = await singletons.ERC1820Registry(owner);
    addAccount(erc1820Registry.address, "ERC1820Registry");

    const ERC721PresetMinterPauserAutoId  = await ethers.getContractFactory("ERC721PresetMinterPauserAutoId");
    erc721PresetMinterPauserAutoId = await ERC721PresetMinterPauserAutoId.deploy("name", "symbol", "uri");
    addAccount(erc721PresetMinterPauserAutoId.address, "ERC721PresetMinterPauserAutoId");
    await printERC721Details(true);
    const erc721PresetMinterPauserAutoIdTransactionReceipt = await erc721PresetMinterPauserAutoId.deployTransaction.wait();
    printEvents([erc721PresetMinterPauserAutoId], erc721PresetMinterPauserAutoIdTransactionReceipt);

    const mint0Tx = await erc721PresetMinterPauserAutoId.mint(owner);
    printEvents([erc721PresetMinterPauserAutoId], await mint0Tx.wait());
    const mint1Tx = await erc721PresetMinterPauserAutoId.mint(user0);
    printEvents([erc721PresetMinterPauserAutoId], await mint1Tx.wait());
    const mint2Tx = await erc721PresetMinterPauserAutoId.mint(user0);
    printEvents([erc721PresetMinterPauserAutoId], await mint2Tx.wait());
    const mint3Tx = await erc721PresetMinterPauserAutoId.mint(user0);
    printEvents([erc721PresetMinterPauserAutoId], await mint3Tx.wait());
    await printERC721Details();

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

    const Nix = await ethers.getContractFactory("Nix");
    const nix = await Nix.deploy("Hello, world!");
    await nix.deployed();

    const approveTx = await erc721PresetMinterPauserAutoId.setApprovalForAll(nix.address, true);
    printEvents([erc721PresetMinterPauserAutoId], await approveTx.wait());
    await printERC721Details();

    const exchangeTx = await nix.exchange(erc721PresetMinterPauserAutoId.address, 0, user1);
    printEvents([nix, erc721PresetMinterPauserAutoId], await exchangeTx.wait());
    await printERC721Details();



    expect(await nix.greet()).to.equal("Hello, world!");

    const setGreetingTx = await nix.setGreeting("Hola, mundo!");

    // wait until the transaction is mined
    await setGreetingTx.wait();

    expect(await nix.greet()).to.equal("Hola, mundo!");
  });
});
