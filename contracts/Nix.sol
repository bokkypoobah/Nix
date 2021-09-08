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

// ----------------------------------------------------------------------------
// ERC Token Standard #20 Interface
// https://github.com/ethereum/EIPs/blob/master/EIPS/eip-20-token-standard.md
// ----------------------------------------------------------------------------
interface ERC20 {
    event Transfer(address indexed from, address indexed to, uint tokens);
    event Approval(address indexed tokenOwner, address indexed spender, uint tokens);

    function totalSupply() external view returns (uint);
    function balanceOf(address tokenOwner) external view returns (uint balance);
    function allowance(address tokenOwner, address spender) external view returns (uint remaining);
    function transfer(address to, uint tokens) external returns (bool success);
    function approve(address spender, uint tokens) external returns (bool success);
    function transferFrom(address from, address to, uint tokens) external returns (bool success);
}


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

    // Maker: BuyAny [x, y, z] - Buy any of x, y or z. Buy any, if [ ]
    // Taker: Sell y
    // Maker must WETH.approve Nix
    // Taker must NFT.approve Nix

    // Maker: SellAny [x, y, z] - Sell any of x, y or z. All must be owned by Maker. Sell any owned by Maker, if [ ]
    // Taker: Buy y
    // Maker must NFT.approve Nix
    // Taker must WETH.approve Nix

    // Maker: BuyAll [x, y, z] - Buy all of x, y and z. All must be owned by Taker. Cannot have [ ]
    // Taker: Sell
    // Maker must WETH.approve Nix
    // Taker must NFT.approve Nix

    // Maker: SellAll [x, y, z] - Sell all of x, y and z. All must be owned by Maker. Cannot have [ ]
    // Taker: Buy
    // Maker must NFT.approve Nix
    // Taker must WETH.approve Nix


    enum OrderType { BuyAny, SellAny, BuyAll, SellAll }
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

    // TODO: Segregate by NFT contract addresses. Or multi-NFTs
    ERC20 public weth;
    bytes32[] public ordersIndex;
    mapping(bytes32 => Order) public orders;

    constructor(ERC20 _weth) {
        weth = _weth;
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
        uint _weth,
        OrderType orderType,
        uint64 expiry
    ) public {
        bytes32 _orderKey = generateOrderKey(msg.sender, taker, token, tokenIds, orderType, expiry);
        require(orders[_orderKey].maker == address(0), "Cannot add duplicate");
        require(expiry == 0 || expiry > block.timestamp, "Invalid expiry");
        ordersIndex.push(_orderKey);
        Order storage order = orders[_orderKey];
        order.maker = msg.sender;
        order.taker = taker;
        order.token = token;
        order.tokenIds = tokenIds;
        order.weth = _weth;
        order.orderType = orderType;
        order.expiry = expiry;
        emit MakerOrderAdded(_orderKey, ordersIndex.length - 1);
    }

    event TakerOrderExecuted(bytes32 orderKey, uint orderIndex);
    function takerExecuteOrder(uint orderIndex, uint tokenId, uint _weth) public {
        bytes32 orderKey = ordersIndex[orderIndex];
        Order storage order = orders[orderKey];
        require(msg.sender != order.maker, "Cannot execute against own order");
        require(order.taker == address(0) || order.taker == msg.sender, "Not the specified taker");
        require(order.expiry == 0 || order.expiry <= block.timestamp, "Order expired");
        require(order.weth == _weth, "Order weth unexpected");

        if (order.orderType == OrderType.BuyAny || order.orderType == OrderType.BuyAll) {
            require(weth.transferFrom(msg.sender, order.maker, _weth), "transferFrom failure");
        } else {
            require(weth.transferFrom(order.maker, msg.sender, _weth), "transferFrom failure");
        }
        bool found = false;
        if (order.orderType == OrderType.BuyAny) {
            for (uint i = 0; i < order.tokenIds.length && !found; i++) {
                if (tokenId == order.tokenIds[i]) {
                    // console.log("safeTransfer");
                    IERC721Partial(order.token).safeTransferFrom(msg.sender, order.maker, tokenId);
                    found = true;
                }
            }
            require(found, "tokenId invalid");
        }
        order.orderStatus = OrderStatus.Executed;
        emit TakerOrderExecuted(orderKey, orderIndex);
    }

    function exchange(IERC721Partial token, uint tokenId, address to) public {
        console.log("      >> Nix.exchange() token '%s', tokenId %s, to %s", address(token), tokenId, to);
        IERC721Partial(token).safeTransferFrom(msg.sender, to, tokenId);
    }

    function ordersLength() public view returns (uint) {
        return ordersIndex.length;
    }
    function getOrderByIndex(uint i) public view returns (Order memory order, bytes32 orderKey) {
        return (orders[ordersIndex[i]], ordersIndex[i]);
    }

}
