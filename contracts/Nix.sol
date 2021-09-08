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

    enum OrderType { SellAll, SellAnyOnce, SellAnyMultiple, BuyAll, BuyAnyOnce, BuyAnyMultiple }
    enum OrderStatus { Active, Cancelled, Executed, NotExecutable }

    struct Order {
        address maker;
        address taker;

        address token;
        uint[] tokenIds;
        uint weth;

        OrderType orderType;
        uint64 expiry;
        OrderStatus orderStatus;
    }

    bytes32[] public ordersIndex;
    mapping(bytes32 => Order) public orders;

    string greeting;

    constructor(string memory _greeting) {
        console.log("      >> Nix.constructor() ", _greeting);
        greeting = _greeting;
    }

    function generateOrderKey(
        address maker,
        address taker,
        address token,
        uint[] memory tokenIds,
        OrderType orderType,
        uint64 expiry
    ) internal pure returns (bytes32 seriesKey) {
        return keccak256(abi.encodePacked(maker, taker, token, tokenIds, orderType, expiry));
    }

    event MakerOrderAdded(bytes32 orderKey, uint orderIndex);
    function makerAddOrder(
        address taker,
        address token,
        uint[] memory tokenIds,
        uint weth,
        OrderType orderType,
        uint64 expiry
    ) public {
        bytes32 _orderKey = generateOrderKey(msg.sender, taker, token, tokenIds, orderType, expiry);
        require(orders[_orderKey].maker == address(0), "Cannot add duplicate");
        // TODO: Expiry check
        ordersIndex.push(_orderKey);
        Order storage order = orders[_orderKey];
        order.maker = msg.sender;
        order.taker = taker;
        order.token = token;
        order.tokenIds = tokenIds;
        order.weth = weth;
        order.orderType = orderType;
        order.expiry = expiry;
        emit MakerOrderAdded(_orderKey, ordersIndex.length - 1);
    }


    function exchange(IERC721Partial token, uint tokenId, address to) public {
        console.log("      >> Nix.exchange() token '%s', tokenId %s, to %s", address(token), tokenId, to);
        IERC721Partial(token).safeTransferFrom(msg.sender, to, tokenId);
    }

    function ordersLength() public view returns (uint) {
        return ordersIndex.length;
    }
    function getOrderByIndex(uint i) public view returns (Order memory order) {
        return orders[ordersIndex[i]];
    }

    function greet() public view returns (string memory) {
      return greeting;
    }

    function setGreeting(string memory _greeting) public {
        console.log("      >> Nix.setGreeting() from '%s' to '%s'", greeting, _greeting);
        greeting = _greeting;
    }
}
