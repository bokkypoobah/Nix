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

    enum OrderType { All, Any }
    enum OrderStatus { Active, Cancelled, Executed }

    struct Order {
        address maker;
        address taker;

        address[] makerTokens;
        uint[] makerTokenIds;
        uint makerWeth;

        address[] takerTokens;
        uint[] takerTokenIds;
        uint takerWeth;

        OrderType makerType;
        OrderType takerType;
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

        address[] memory makerTokens,
        uint[] memory makerTokenIds,
//        uint makerWeth,

        address[] memory takerTokens,
        uint[] memory takerTokenIds,
//        uint takerWeth,

        OrderType makerType,
        OrderType takerType,
        uint64 expiry
//        OrderStatus orderStatus;

    ) internal pure returns (bytes32 seriesKey) {
        return keccak256(abi.encodePacked(maker, taker, makerTokens, makerTokenIds, takerTokens, takerTokenIds, makerType, takerType, expiry));
    }

    event MakerOrderAdded(bytes32 orderKey, uint orderIndex);
    function makerAddOrder(
////        address maker,
        address taker,

        address[] memory makerTokens,
        uint[] memory makerTokenIds,
        uint makerWeth,

        address[] memory takerTokens,
        uint[] memory takerTokenIds,
        uint takerWeth,

        OrderType makerType,
        OrderType takerType,
        uint64 expiry
//        OrderStatus orderStatus;
    ) public {
        bytes32 _orderKey = generateOrderKey(msg.sender, taker, makerTokens, makerTokenIds, takerTokens, takerTokenIds, makerType, takerType, expiry);
        require(orders[_orderKey].maker == address(0), "Cannot add duplicate");
        ordersIndex.push(_orderKey);
        Order storage order = orders[_orderKey];
        order.maker = msg.sender;
        order.taker = taker;
        order.makerTokens = makerTokens;
        order.makerTokenIds = makerTokenIds;
        order.takerTokens = takerTokens;
        order.takerTokenIds = takerTokenIds;
        order.makerWeth = makerWeth;
        order.takerWeth = takerWeth;
        order.makerType = makerType;
        order.takerType = takerType;
        order.expiry = expiry;
        // default order.orderStatus = OrderType.All;
        emit MakerOrderAdded(_orderKey, ordersIndex.length - 1);
        // order.
        // uint _seriesIndex = seriesIndex.length - 1;
        // seriesData[seriesKey] = Series(block.timestamp, _seriesIndex, seriesKey, inputData.pair, inputData.feeds, inputData.feedParameters, [callPut, expiry, strike, bound, 0], optinos);
        // emit SeriesAdded(seriesKey, _seriesIndex, optinos);
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
