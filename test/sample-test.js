const { expect } = require("chai");

describe("Nix", function () {
  it("Should return the new greeting once it's changed", async function () {
    const Nix = await ethers.getContractFactory("Nix");
    const greeter = await Nix.deploy("Hello, world!");
    await greeter.deployed();

    expect(await greeter.greet()).to.equal("Hello, world!");

    const setGreetingTx = await greeter.setGreeting("Hola, mundo!");

    // wait until the transaction is mined
    await setGreetingTx.wait();

    expect(await greeter.greet()).to.equal("Hola, mundo!");
  });
});
