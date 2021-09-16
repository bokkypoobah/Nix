pragma solidity ^0.8.0;

// import "hardhat/console.sol";

// ----------------------------------------------------------------------------
// Nix v0.9.0
//
// https://github.com/bokkypoobah/Nix
//
// Deployed to
//
// SPDX-License-Identifier: MIT
//
// Enjoy. And hello, from the past.
//
// (c) BokkyPooBah / Bok Consulting Pty Ltd 2021. The MIT Licence.
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// ERC Token Standard #20 Interface
// https://github.com/ethereum/EIPs/blob/master/EIPS/eip-20-token-standard.md
// ----------------------------------------------------------------------------
interface IERC20Partial {
    function balanceOf(address tokenOwner) external view returns (uint balance);
    function allowance(address tokenOwner, address spender) external view returns (uint remaining);
    function transfer(address to, uint tokens) external returns (bool success);
    function transferFrom(address from, address to, uint tokens) external returns (bool success);
}

interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

interface IERC721Partial is IERC165 {
    function ownerOf(uint256 tokenId) external view returns (address);
    function balanceOf(address owner) external view returns (uint256 balance);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
    function safeTransferFrom(address _from, address _to, uint256 _tokenId) external payable;
}

interface ERC721TokenReceiver {
    function onERC721Received(address _operator, address _from, uint256 _tokenId, bytes memory _data) external returns(bytes4);
}

/// @notice Ownership
contract Owned {
    address public owner;
    address public newOwner;

    event OwnershipTransferred(address indexed _from, address indexed _to);

    modifier onlyOwner {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }
    function transferOwnership(address _newOwner) public onlyOwner {
        newOwner = _newOwner;
    }
    function acceptOwnership() public {
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
        newOwner = address(0);
    }

    event TipsWithdrawn(address indexed token, uint tokens, uint tokenId);
    function withdrawTips(address token, uint tokens, uint tokenId) public onlyOwner {
        if (tokenId == 0) {
            if (token == address(0)) {
                payable(owner).transfer((tokens == 0 ? address(this).balance : tokens));
            } else {
                IERC20Partial(token).transfer(owner, tokens == 0 ? IERC20Partial(token).balanceOf(address(this)) : tokens);
            }
        } else {
            IERC721Partial(token).safeTransferFrom(address(this), owner, tokenId);
        }
        emit TipsWithdrawn(address(token), tokens, tokenId);
    }
}


contract Nix is Owned, ERC721TokenReceiver {

    enum OrderType { BuyAny, SellAny, BuyAll, SellAll }

    struct Order {
        address maker;
        address taker;

        address token;
        uint[] tokenIds;
        uint price;

        OrderType orderType;
        uint64 expiry;
        uint64 tradeCount;
        uint64 tradeMax;
    }

    bytes4 constant ERC721INTERFACE = 0x80ac58cd; // https://eips.ethereum.org/EIPS/eip-721

    // TODO: Segregate by NFT contract addresses. Or multi-NFTs
    IERC20Partial public weth;
    bytes32[] public ordersIndex;
    mapping(bytes32 => Order) public orders;
    // TODO mapping(address => bytes32[]) public ordersIndices;

    constructor(IERC20Partial _weth) {
        weth = _weth;
    }

    function onERC721Received(address /*_operator*/, address /*_from*/, uint256 _tokenId, bytes memory /*_data*/) external override returns(bytes4) {
        emit ThankYou(_tokenId);
        return this.onERC721Received.selector;
    }

    event MakerOrderAdded(bytes32 orderKey, uint orderIndex);
    function makerAddOrder(
        address taker,
        address token,
        uint[] memory tokenIds,
        uint price,
        OrderType orderType,
        uint64 expiry,
        uint64 tradeMax,
        address integrator
    ) external payable reentrancyGuard {
        bytes32 _orderKey = keccak256(abi.encodePacked(msg.sender, taker, token, tokenIds, orderType, expiry));
        require(orders[_orderKey].maker == address(0), "Duplicate");
        require(expiry == 0 || expiry > block.timestamp, "Invalid expiry");
        if (orderType == OrderType.BuyAll || orderType == OrderType.SellAll) {
            require(tokenIds.length > 0, "No tokenIds specified");
            require(tradeMax == 1, "Only single trade");
        } else {
            require(tradeMax > 0, "Must have at least one trade");
        }

        // TODO
        // bytes32[] memory index = ordersIndices[token];
        // if (ordersIndices[token].length == 0) {
        //     ordersIndices[token].push
        //     console.log("index.length == 0");
        // }


        ordersIndex.push(_orderKey);
        Order storage order = orders[_orderKey];
        order.maker = msg.sender;
        order.taker = taker;
        order.token = token;

        try IERC721Partial(order.token).supportsInterface(ERC721INTERFACE) returns (bool /*b*/) {
            // console.log("Result %s", b);
        } catch {
            // console.log("ERROR ");
        }

        order.tokenIds = tokenIds;
        order.price = price;
        order.orderType = orderType;
        order.expiry = expiry;
        order.tradeMax = tradeMax;
        emit MakerOrderAdded(_orderKey, ordersIndex.length - 1);
        handleTips(integrator);
    }

    // event MakerTokenIdsUpdated(bytes32 orderKey, uint orderIndex);
    // function makerUpdateTokenIds(uint orderIndex, uint[] memory tokenIds, address integrator) external payable reentrancyGuard {
    //     bytes32 orderKey = ordersIndex[orderIndex];
    //     Order storage order = orders[orderKey];
    //     require(msg.sender == order.maker, "Not maker");
    //     order.tokenIds = tokenIds;
    //     emit MakerTokenIdsUpdated(orderKey, orderIndex);
    //     handleTips(integrator);
    // }

    // event MakerOrderUpdated(bytes32 orderKey, uint orderIndex);
    // function makerUpdateOrder(uint orderIndex, uint price, uint64 expiry, int64 tradeMaxAdjustment, address integrator) external payable reentrancyGuard {
    //     bytes32 orderKey = ordersIndex[orderIndex];
    //     Order storage order = orders[orderKey];
    //     require(msg.sender == order.maker, "Not maker");
    //     order.price = price;
    //     order.expiry = expiry;
    //     // TODO: tradeMax must be 1 for BuyAll and SellAll - cannot change this
    //     if (tradeMaxAdjustment < 0) {
    //         uint64 subtract = uint64(-tradeMaxAdjustment);
    //         if (subtract > (order.tradeMax - order.tradeCount)) {
    //             order.tradeMax -= subtract;
    //         } else {
    //             order.tradeMax = order.tradeCount;
    //         }
    //     } else {
    //         order.tradeMax += uint64(tradeMaxAdjustment);
    //     }
    //     emit MakerOrderUpdated(orderKey, orderIndex);
    //     handleTips(integrator);
    // }

    function takerExecuteOrders(uint[] memory orderIndexes, uint[][] memory tokenIdsList, int totalPrice, address integrator) external payable reentrancyGuard {
        require(orderIndexes.length > 0);
        require(orderIndexes.length == tokenIdsList.length);
        for (uint i = 0; i < orderIndexes.length; i++) {
            bytes32 orderKey = ordersIndex[orderIndexes[i]];
            Order storage order = orders[orderKey];
            uint[] memory tokenIds = tokenIdsList[i];
            require(tokenIds.length > 0, "TokenIds");
            require(order.taker == address(0) || order.taker == msg.sender, "Not taker");
            require(order.expiry == 0 || order.expiry >= block.timestamp, "Expired");
            require(order.tradeCount < order.tradeMax, "Maxxed");

            address nftFrom;
            address nftTo;
            uint priceMultiple;

            if (order.orderType == OrderType.BuyAny) {
                (nftFrom, nftTo, priceMultiple) = (msg.sender, order.maker, tokenIds.length);
            } else if (order.orderType == OrderType.SellAny) {
                (nftFrom, nftTo, priceMultiple) = (order.maker, msg.sender, tokenIds.length);
            } else if (order.orderType == OrderType.BuyAll) {
                (nftFrom, nftTo, priceMultiple) = (msg.sender, order.maker, 1);
            } else { // SellAll
                (nftFrom, nftTo, priceMultiple) = (order.maker, msg.sender, 1);
            }

            if (order.orderType == OrderType.BuyAny || order.orderType == OrderType.SellAny) {
                for (uint j = 0; j < tokenIds.length; j++) {
                    bool found = false;
                    if (order.tokenIds.length == 0) {
                        found = true;
                    } else {
                        for (uint k = 0; k < order.tokenIds.length && !found; k++) {
                            if (tokenIds[j] == order.tokenIds[k]) {
                                found = true;
                            }
                        }
                    }
                    require(found, "TokenId");
                    IERC721Partial(order.token).safeTransferFrom(nftFrom, nftTo, tokenIds[j]);
                }
            } else if (order.orderType == OrderType.BuyAll || order.orderType == OrderType.SellAll) {
                for (uint j = 0; j < order.tokenIds.length; j++) {
                    require(tokenIds[j] == order.tokenIds[j], "TokenIds");
                    IERC721Partial(order.token).safeTransferFrom(nftFrom, nftTo, order.tokenIds[j]);
                }
            }
            order.tradeCount++;
            emit TakerOrderExecuted(orderKey, i);
        }
        handleTips(integrator);
    }

    event TakerOrderExecuted(bytes32 orderKey, uint orderIndex);
    function takerExecuteOrder(uint orderIndex, uint[] memory tokenIds, uint totalPrice, address integrator) external payable reentrancyGuard {
        bytes32 orderKey = ordersIndex[orderIndex];
        Order storage order = orders[orderKey];
        require(msg.sender != order.maker, "Own order");
        require(order.taker == address(0) || order.taker == msg.sender, "Not taker");
        require(order.expiry == 0 || order.expiry >= block.timestamp, "Expired");
        require(order.tradeCount < order.tradeMax, "Maxxed");
        require(tokenIds.length > 0, "TokenIds");

        address nftFrom;
        address nftTo;
        uint priceMultiple;

        if (order.orderType == OrderType.BuyAny) {
            (nftFrom, nftTo, priceMultiple) = (msg.sender, order.maker, tokenIds.length);
        } else if (order.orderType == OrderType.SellAny) {
            (nftFrom, nftTo, priceMultiple) = (order.maker, msg.sender, tokenIds.length);
        } else if (order.orderType == OrderType.BuyAll) {
            (nftFrom, nftTo, priceMultiple) = (msg.sender, order.maker, 1);
        } else { // SellAll
            (nftFrom, nftTo, priceMultiple) = (order.maker, msg.sender, 1);
        }

        require(order.price * priceMultiple == totalPrice, "TotalPrice");
        require(weth.transferFrom(nftTo, nftFrom, totalPrice), "Weth tx");

        // if (order.orderType == OrderType.BuyAny) {
        //     for (uint i = 0; i < tokenIds.length; i++) {
        //         bool found = false;
        //         if (order.tokenIds.length == 0) {
        //             found = true;
        //         } else {
        //             for (uint j = 0; j < order.tokenIds.length && !found; j++) {
        //                 if (tokenIds[i] == order.tokenIds[j]) {
        //                     found = true;
        //                 }
        //             }
        //         }
        //         require(found, "TokenId");
        //         IERC721Partial(order.token).safeTransferFrom(msg.sender, order.maker, tokenIds[i]);
        //     }
        // } else if (order.orderType == OrderType.SellAny) {
        //     for (uint i = 0; i < tokenIds.length; i++) {
        //         bool found = false;
        //         if (order.tokenIds.length == 0) {
        //             found = true;
        //         } else {
        //             for (uint j = 0; j < order.tokenIds.length && !found; j++) {
        //                 if (tokenIds[i] == order.tokenIds[j]) {
        //                     found = true;
        //                 }
        //             }
        //         }
        //         require(found, "TokenId");
        //         IERC721Partial(order.token).safeTransferFrom(order.maker, msg.sender, tokenIds[i]);
        //     }
        // } else if (order.orderType == OrderType.BuyAll) {
        //     for (uint i = 0; i < order.tokenIds.length; i++) {
        //         require(tokenIds[i] == order.tokenIds[i], "TokenIds");
        //         IERC721Partial(order.token).safeTransferFrom(msg.sender, order.maker, order.tokenIds[i]);
        //     }
        // } else { // SellAll
        //     for (uint i = 0; i < order.tokenIds.length; i++) {
        //         require(tokenIds[i] == order.tokenIds[i], "TokenIds");
        //         IERC721Partial(order.token).safeTransferFrom(order.maker, msg.sender, order.tokenIds[i]);
        //     }
        // }
        //
        // order.tradeCount++;
        emit TakerOrderExecuted(orderKey, orderIndex);
        handleTips(integrator);
    }

    function ordersLength() public view returns (uint) {
        return ordersIndex.length;
    }
    enum OrderStatus { Executable, Expired, Maxxed, MakerNoWeth, MakerNoWethAllowance, MakerNoToken, MakerNotApprovedNix, UnknownError }
    function orderStatus(uint i) private view returns (OrderStatus) {
        bytes32 orderKey = ordersIndex[i];
        Order memory order = orders[orderKey];
        if (order.expiry > 0 && order.expiry < block.timestamp) {
            return OrderStatus.Expired;
        }
        if (order.tradeCount >= order.tradeMax) {
            return OrderStatus.Maxxed;
        }
        if (order.orderType == OrderType.BuyAny || order.orderType == OrderType.BuyAll) {
            uint wethBalance = weth.balanceOf(order.maker);
            if (wethBalance < order.price) {
                return OrderStatus.MakerNoWeth;
            }
            uint wethAllowance = weth.allowance(order.maker, address(this));
            if (wethAllowance < order.price) {
                return OrderStatus.MakerNoWethAllowance;
            }
        } else {
            try IERC721Partial(order.token).isApprovedForAll(order.maker, address(this)) returns (bool b) {
                if (!b) {
                    return OrderStatus.MakerNotApprovedNix;
                }
            } catch {
                return OrderStatus.UnknownError;
            }
            if (order.orderType == OrderType.SellAny) {
                if (order.tokenIds.length == 0) {
                    try IERC721Partial(order.token).balanceOf(order.maker) returns (uint b) {
                        if (b == 0) {
                            return OrderStatus.MakerNoToken;
                        }
                    } catch {
                        return OrderStatus.UnknownError;
                    }
                } else {
                    bool found = false;
                    for (uint j = 0; j < order.tokenIds.length && !found; j++) {
                        try IERC721Partial(order.token).ownerOf(order.tokenIds[j]) returns (address a) {
                            if (a == order.maker) {
                                found = true;
                            }
                        } catch {
                            return OrderStatus.UnknownError;
                        }
                    }
                    if (!found) {
                        return OrderStatus.MakerNoToken;
                    }
                }
            } else { // SellAll
                for (uint j = 0; j < order.tokenIds.length; j++) {
                    try IERC721Partial(order.token).ownerOf(order.tokenIds[j]) returns (address a) {
                        if (a != order.maker) {
                            return OrderStatus.MakerNoToken;
                        }
                    } catch {
                        return OrderStatus.UnknownError;
                    }
                }
            }
        }
        return OrderStatus.Executable;
    }

    function getOrders(
        uint[] memory orderIndices
    ) public view returns (
        bytes32[] memory orderKeys,
        address[] memory makers,
        address[] memory takers,
        address[] memory tokens,
        // address[3][] memory addresses,
        uint[][] memory tokenIds,
        uint[] memory prices,
        uint64[5][] memory data
    ) {
        uint length = orderIndices.length;
        orderKeys = new bytes32[](length);
        makers = new address[](length);
        takers = new address[](length);
        tokens = new address[](length);
        // addresses = new address[3][](length);
        tokenIds = new uint[][](length);
        prices = new uint[](length);
        data = new uint64[5][](length);
        for (uint i = 0; i < orderIndices.length; i++) {
            uint orderIndex = orderIndices[i];
            if (orderIndex < ordersIndex.length) {
                bytes32 orderKey = ordersIndex[orderIndex];
                Order memory order = orders[orderKey];
                orderKeys[i] = orderKey;
                makers[i] = order.maker;
                takers[i] = order.taker;
                tokens[i] = order.token;
                // addresses[0][i] = order.maker;
                // addresses[1][i] = order.taker;
                // addresses[2][i] = order.token;
                tokenIds[i] = order.tokenIds;
                prices[i] = order.price;
                data[i][0] = uint64(order.orderType);
                data[i][1] = uint64(order.expiry);
                data[i][2] = uint64(order.tradeCount);
                data[i][3] = uint64(order.tradeMax);
                data[i][4] = uint64(orderStatus(i));
            }
        }
    }


    uint256 private _status;
    modifier reentrancyGuard() {
        require(_status != 1, "Reentrancy");
        _status = 1;
        _;
        _status = 2;
    }

    event ThankYou(uint tip);
    function handleTips(address integrator) private {
        if (msg.value > 0) {
            uint integratorTip;
            if (integrator != address(0) && integrator != owner) {
                integratorTip = msg.value / 2;
                if (integratorTip > 0) {
                    payable(integrator).transfer(integratorTip);
                }
            }
            emit ThankYou(msg.value);
        }
    }

    receive() external payable {
    }
}
