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
    // event Transfer(address indexed from, address indexed to, uint tokens);
    // event Approval(address indexed tokenOwner, address indexed spender, uint tokens);
    //
    // function totalSupply() external view returns (uint);
    function balanceOf(address tokenOwner) external view returns (uint balance);
    function allowance(address tokenOwner, address spender) external view returns (uint remaining);
    // function transfer(address to, uint tokens) external returns (bool success);
    // function approve(address spender, uint tokens) external returns (bool success);
    function transferFrom(address from, address to, uint tokens) external returns (bool success);
}


interface IERC721Partial {
    // function name() external view returns (string memory);
    // function symbol() external view returns (string memory);
    // function totalSupply() external view returns (uint256);
    //
    function ownerOf(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
    // function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256);
    // function tokenByIndex(uint256 index) external view returns (uint256);
    // function tokenURI(uint256 tokenId) external view returns (string memory);

    function safeTransferFrom(address _from, address _to, uint256 _tokenId) external payable;
}


// contract ERC721Helper {
//     function tokenInfo(IERC721Partial token) external view returns(string memory _symbol, string memory _name, uint _totalSupply) {
//         return (token.symbol(), token.name(), token.totalSupply());
//     }
//
//     function tokenURIs(IERC721Partial token, uint from, uint to) external view returns(uint[] memory _tokenIds, string[] memory _tokenURIs) {
//         require(from < to && to <= token.totalSupply());
//         _tokenIds = new uint[](to - from);
//         _tokenURIs = new string[](to - from);
//         uint i = 0;
//         for (uint index = from; index < to; index++) {
//             uint tokenId = token.tokenByIndex(index);
//             _tokenIds[i] = tokenId;
//             _tokenURIs[i] = token.tokenURI(tokenId);
//             i++;
//         }
//     }
//
//     function owners(IERC721Partial token, uint from, uint to) external view returns(uint[] memory _tokenIds, address[] memory _owners) {
//         require(from < to && to <= token.totalSupply());
//         _tokenIds = new uint[](to - from);
//         _owners = new address[](to - from);
//         uint i = 0;
//         for (uint index = from; index < to; index++) {
//             uint tokenId = token.tokenByIndex(index);
//             _tokenIds[i] = tokenId;
//             _owners[i] = token.ownerOf(tokenId);
//             i++;
//         }
//     }
// }


contract Nix {

    enum OrderType { BuyAny, SellAny, BuyAll, SellAll }

    struct Order {
        address maker;
        address taker;

        address token;
        uint[] tokenIds;
        uint weth;

        OrderType orderType;
        uint64 expiry;
        uint64 tradeCount;
        uint64 tradeMax;
    }

    // TODO: Segregate by NFT contract addresses. Or multi-NFTs
    ERC20 public weth;
    bytes32[] public ordersIndex;
    mapping(bytes32 => Order) public orders;

    constructor(ERC20 _weth) {
        weth = _weth;
    }

    // function generateOrderKey(
    //     address maker,
    //     address taker,
    //     address token,
    //     uint[] memory tokenIds,
    //     OrderType orderType,
    //     uint64 expiry
    // ) internal pure returns (bytes32 seriesKey) {
    //     return keccak256(abi.encodePacked(maker, taker, token, tokenIds, orderType, expiry));
    // }

    event MakerOrderAdded(bytes32 orderKey, uint orderIndex);
    function makerAddOrder(
        address taker,
        address token,
        uint[] memory tokenIds,
        uint _weth,
        OrderType orderType,
        uint64 expiry,
        uint64 tradeMax
    ) public {
        // bytes32 _orderKey = generateOrderKey(msg.sender, taker, token, tokenIds, orderType, expiry);
        bytes32 _orderKey = keccak256(abi.encodePacked(msg.sender, taker, token, tokenIds, orderType, expiry));
        require(orders[_orderKey].maker == address(0), "Cannot add duplicate");
        require(expiry == 0 || expiry > block.timestamp, "Invalid expiry");
        if (orderType == OrderType.BuyAll || orderType == OrderType.SellAll) {
            require(tokenIds.length > 0, "No tokenIds specified");
            require(tradeMax == 1, "Only single trade");
        } else {
            require(tradeMax > 0, "Must have at least one trade");
        }
        ordersIndex.push(_orderKey);
        Order storage order = orders[_orderKey];
        order.maker = msg.sender;
        order.taker = taker;
        order.token = token;
        order.tokenIds = tokenIds;
        order.weth = _weth;
        order.orderType = orderType;
        order.expiry = expiry;
        order.tradeMax = tradeMax;
        emit MakerOrderAdded(_orderKey, ordersIndex.length - 1);
    }

    event MakerTokenIdsUpdated(bytes32 orderKey, uint orderIndex);
    function makerUpdateTokenIds(uint orderIndex, uint[] memory tokenIds) public {
        bytes32 orderKey = ordersIndex[orderIndex];
        Order storage order = orders[orderKey];
        require(msg.sender == order.maker, "Only maker can update");
        order.tokenIds = tokenIds;
        emit MakerTokenIdsUpdated(orderKey, orderIndex);
    }

    event MakerOrderUpdated(bytes32 orderKey, uint orderIndex);
    function makerUpdateOrder(uint orderIndex, uint _weth, uint64 expiry, int64 tradeMaxAdjustment) public {
        bytes32 orderKey = ordersIndex[orderIndex];
        Order storage order = orders[orderKey];
        require(msg.sender == order.maker, "Only maker can update");
        order.weth = _weth;
        order.expiry = expiry;
        if (tradeMaxAdjustment < 0) {
            uint64 subtract = uint64(-tradeMaxAdjustment);
            if (subtract > (order.tradeMax - order.tradeCount)) {
                order.tradeMax -= subtract;
            } else {
                order.tradeMax = order.tradeCount;
            }
        } else {
            order.tradeMax += uint64(tradeMaxAdjustment);
        }
        emit MakerOrderUpdated(orderKey, orderIndex);
    }

    event TakerOrderExecuted(bytes32 orderKey, uint orderIndex);
    function takerExecuteOrder(uint orderIndex, uint tokenId, uint _weth) public {
        bytes32 orderKey = ordersIndex[orderIndex];
        Order storage order = orders[orderKey];
        require(msg.sender != order.maker, "Cannot execute against own order");
        require(order.taker == address(0) || order.taker == msg.sender, "Not the specified taker");
        require(order.expiry == 0 || order.expiry >= block.timestamp, "Order expired");
        require(order.weth == _weth, "Order weth unexpected");
        require(order.tradeCount < order.tradeMax, "Max trades already executed");

        if (order.orderType == OrderType.BuyAny || order.orderType == OrderType.BuyAll) {
            require(weth.transferFrom(order.maker, msg.sender, _weth), "transferFrom failure");
        } else {
            require(weth.transferFrom(msg.sender, order.maker, _weth), "transferFrom failure");
        }
        if (order.orderType == OrderType.BuyAny) {
            bool found = false;
            if (order.tokenIds.length == 0) {
                found = true;
            } else {
                for (uint i = 0; i < order.tokenIds.length && !found; i++) {
                    if (tokenId == order.tokenIds[i]) {
                        found = true;
                    }
                }
            }
            require(found, "tokenId invalid");
            IERC721Partial(order.token).safeTransferFrom(msg.sender, order.maker, tokenId);
        } else if (order.orderType == OrderType.SellAny) {
            bool found = false;
            if (order.tokenIds.length == 0) {
                found = true;
            } else {
                for (uint i = 0; i < order.tokenIds.length && !found; i++) {
                    if (tokenId == order.tokenIds[i]) {
                        found = true;
                    }
                }
            }
            require(found, "tokenId invalid");
            IERC721Partial(order.token).safeTransferFrom(order.maker, msg.sender, tokenId);
        } else if (order.orderType == OrderType.BuyAll) {
            for (uint i = 0; i < order.tokenIds.length; i++) {
                IERC721Partial(order.token).safeTransferFrom(msg.sender, order.maker, order.tokenIds[i]);
            }
        } else { // SellAll
            for (uint i = 0; i < order.tokenIds.length; i++) {
                IERC721Partial(order.token).safeTransferFrom(order.maker, msg.sender, order.tokenIds[i]);
            }
        }

        order.tradeCount++;
        emit TakerOrderExecuted(orderKey, orderIndex);
    }

    function exchange(IERC721Partial token, uint tokenId, address to) public {
        console.log("      >> Nix.exchange() token '%s', tokenId %s, to %s", address(token), tokenId, to);
        IERC721Partial(token).safeTransferFrom(msg.sender, to, tokenId);
    }

    function ordersLength() public view returns (uint) {
        return ordersIndex.length;
    }
    enum OrderStatus { Executable, Expired, Maxxed, MakerHasUnsufficientWeth, MakerHasUnsufficientWethAllowance,
        MakerNoLongerOwnsToken, MakerHasNotApprovedNix }
    function orderStatus(uint i) internal view returns (uint) {
        bytes32 orderKey = ordersIndex[i];
        Order memory order = orders[orderKey];
        if (order.expiry > 0 && order.expiry < block.timestamp) {
            return uint(OrderStatus.Expired);
        }
        if (order.tradeCount >= order.tradeMax) {
            return uint(OrderStatus.Maxxed);
        }
        if (order.orderType == OrderType.BuyAny || order.orderType == OrderType.BuyAll) {
            uint wethBalance = weth.balanceOf(order.maker);
            if (wethBalance < order.weth) {
                return uint(OrderStatus.MakerHasUnsufficientWeth);
            }
            uint wethAllowance = weth.allowance(order.maker, address(this));
            if (wethAllowance < order.weth) {
                return uint(OrderStatus.MakerHasUnsufficientWethAllowance);
            }
        } else if (order.orderType == OrderType.SellAny) {
            return 112;
        } else { // SellAll
            for (uint j = 0; j < order.tokenIds.length; j++) {
                address owner = IERC721Partial(order.token).ownerOf(order.tokenIds[j]);
                if (owner != order.maker) {
                    return uint(OrderStatus.MakerNoLongerOwnsToken);
                }
                // console.log("      >> SellAll: %s. %s %s", j, order.tokenIds[j], order.token);
            }
            if (!IERC721Partial(order.token).isApprovedForAll(order.maker, address(this))) {
                return uint(OrderStatus.MakerHasNotApprovedNix);
            }
            // return 224;
        }
        return uint(OrderStatus.Executable);
    }
    function getOrderByIndex(uint i) public view returns (Order memory order, bytes32 orderKey, uint _orderStatus) {
        return (orders[ordersIndex[i]], ordersIndex[i], uint(orderStatus(i)));
    }

}
