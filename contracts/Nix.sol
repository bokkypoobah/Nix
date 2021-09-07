pragma solidity ^0.8.0;

import "hardhat/console.sol";

// ----------------------------------------------------------------------------
// Nix v0.9.0
//
// https://github.com/bokkypoobah/Nix
//
// Deployed to
//
// SPDX-License-Identifier: MIT
//
// Enjoy.
//
// (c) BokkyPooBah / Bok Consulting Pty Ltd 2021. The MIT Licence.
// ----------------------------------------------------------------------------

interface IERC721Partial {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function totalSupply() external view returns (uint256);

    function ownerOf(uint256 tokenId) external view returns (address);
    function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256);
    function tokenByIndex(uint256 index) external view returns (uint256);
    function tokenURI(uint256 tokenId) external view returns (string memory);

    function safeTransferFrom(address _from, address _to, uint256 _tokenId) external payable;
}


contract ERC721Helper {
    function tokenInfo(IERC721Partial token) external view returns(string memory _symbol, string memory _name, uint _totalSupply) {
        return (token.symbol(), token.name(), token.totalSupply());
    }

    function tokenURIs(IERC721Partial token, uint from, uint to) external view returns(uint[] memory _tokenIds, string[] memory _tokenURIs) {
        require(from < to && to <= token.totalSupply());
        _tokenIds = new uint[](to - from);
        _tokenURIs = new string[](to - from);
        uint i = 0;
        for (uint index = from; index < to; index++) {
            uint tokenId = token.tokenByIndex(index);
            _tokenIds[i] = tokenId;
            _tokenURIs[i] = token.tokenURI(tokenId);
            i++;
        }
    }

    function owners(IERC721Partial token, uint from, uint to) external view returns(uint[] memory _tokenIds, address[] memory _owners) {
        require(from < to && to <= token.totalSupply());
        _tokenIds = new uint[](to - from);
        _owners = new address[](to - from);
        uint i = 0;
        for (uint index = from; index < to; index++) {
            uint tokenId = token.tokenByIndex(index);
            _tokenIds[i] = tokenId;
            _owners[i] = token.ownerOf(tokenId);
            i++;
        }
    }
}


contract Nix {

    enum OrderType { Any, All }
    enum OrderStatus { Active, Cancelled, Executed }

    // TODO: Optimise to minimise storage requirement
    struct Order {
        uint64 expiry;

        address maker;
        OrderStatus orderStatus;
        OrderType makerOrderType;
        address[] makerNFTContracts;
        uint[] makerNFTTokenIds;
        uint makerWeth;

        address taker; // null for anyone
        OrderType takerOrderType;
        address[] takerNFTContracts;
        uint[] takerNFTTokenIds;
        uint takerWeth;
    }

    Order[] public orders;
    mapping(bytes32 => uint) orderIndex;

    string greeting;

    constructor(string memory _greeting) {
        console.log("      >> Nix.constructor() ", _greeting);
        greeting = _greeting;
    }

    function exchange(IERC721Partial token, uint tokenId, address to) public {
        console.log("      >> Nix.exchange() token '%s', tokenId %s, to %s", address(token), tokenId, to);
        IERC721Partial(token).safeTransferFrom(msg.sender, to, tokenId);
    }

    function greet() public view returns (string memory) {
      return greeting;
    }

    function setGreeting(string memory _greeting) public {
        console.log("      >> Nix.setGreeting() from '%s' to '%s'", greeting, _greeting);
        greeting = _greeting;
    }
}
